/**
 * ACE SDK utilities for MicroPaylink.
 *
 * Encryption flow (upload):
 *   1. Fetch EncryptionKey from ACE workers
 *   2. ace.encrypt(key, contractId, domain, plaintext) → ciphertext
 *   3. Upload ciphertext bytes to Shelby
 *
 * Decryption flow (download):
 *   1. Download raw ciphertext from Shelby
 *   2. User signs the FullDecryptionDomain message with their wallet
 *   3. Build ProofOfPermission from signature
 *   4. Fetch DecryptionKey from ACE workers (they call check_permission on-chain)
 *   5. ace.decrypt(decryptionKey, ciphertext) → original file bytes
 */

import { ace } from '@aptos-labs/ace-sdk';
import { AccountAddress, Ed25519PublicKey, Ed25519Signature, AnyPublicKey, AnySignature } from '@aptos-labs/ts-sdk';
import type { PublicKey, Signature } from '@aptos-labs/ts-sdk';
import { MARKETPLACE_REGISTRY_ADDRESS } from '@/lib/constants';

// Aptos testnet chain ID
const APTOS_TESTNET_CHAIN_ID = 2;

// Public ACE test workers (see https://github.com/aptos-labs/ace)
const ACE_WORKER_ENDPOINTS = [
    'https://ace-worker-0-646682240579.europe-west1.run.app',
    'https://ace-worker-1-646682240579.europe-west1.run.app',
];

/** Build the ACE Committee of public test workers. */
export function buildAceCommittee(): ace.Committee {
    return new ace.Committee({
        workerEndpoints: ACE_WORKER_ENDPOINTS,
        threshold: 2,
    });
}

/**
 * Build the ContractID that points to our marketplace::check_permission function.
 * ACE workers call this function on-chain to verify a buyer's permission.
 */
export function buildAceContractId(): ace.ContractID {
    return ace.ContractID.newAptos({
        chainId: APTOS_TESTNET_CHAIN_ID,
        moduleAddr: AccountAddress.from(MARKETPLACE_REGISTRY_ADDRESS),
        moduleName: 'marketplace',
        functionName: 'check_permission',
    });
}

/**
 * Build a FullDecryptionDomain from a blob name.
 * This is deterministic — no storage needed; reconstruct on the buy page.
 */
export function buildFullDecryptionDomain(blobName: string): ace.FullDecryptionDomain {
    const contractId = buildAceContractId();
    const domain = new TextEncoder().encode(blobName);
    return new ace.FullDecryptionDomain({ contractId, domain });
}

/**
 * ACE-encrypt file bytes.
 * Returns the serialized ciphertext bytes to be stored on Shelby.
 */
export async function aceEncryptFile(
    fileBytes: Uint8Array,
    blobName: string,
    onStatus?: (msg: string) => void
): Promise<Uint8Array> {
    onStatus?.('Fetching ACE encryption key from workers...');
    const committee = buildAceCommittee();

    const encKeyResult = await ace.EncryptionKey.fetch({ committee });
    if (!encKeyResult.isOk) {
        throw new Error(`Failed to fetch ACE encryption key: ${encKeyResult.errValue}`);
    }
    const encryptionKey = encKeyResult.okValue!;

    onStatus?.('Encrypting with ACE threshold encryption...');
    const contractId = buildAceContractId();
    const domain = new TextEncoder().encode(blobName);

    const encResult = ace.encrypt({ encryptionKey, contractId, domain, plaintext: fileBytes });
    if (!encResult.isOk) {
        throw new Error(`ACE encryption failed: ${encResult.errValue}`);
    }

    return encResult.okValue!.ciphertext.toBytes();
}

/**
 * ACE-decrypt a ciphertext buffer using a ProofOfPermission.
 * The ACE workers call check_permission on-chain before releasing key shares.
 *
 * Retries automatically with exponential backoff when workers return
 * "insufficient shares" — this typically means their RPC node hasn't
 * indexed the purchase transaction yet (indexer lag).
 */
export async function aceDecryptBuffer(
    ciphertextBytes: Uint8Array,
    blobName: string,
    proof: ace.ProofOfPermission,
    onStatus?: (msg: string) => void
): Promise<Uint8Array> {
    const committee = buildAceCommittee();
    const contractId = buildAceContractId();
    const domain = new TextEncoder().encode(blobName);

    // Retry config: up to 5 attempts, delays of 5s → 10s → 20s → 40s → 80s
    const MAX_RETRIES = 5;
    const BASE_DELAY_MS = 5000;

    const ciphertextResult = ace.Ciphertext.fromBytes(ciphertextBytes);
    if (!ciphertextResult.isOk) {
        throw new Error(`Invalid ACE ciphertext: ${ciphertextResult.errValue}`);
    }
    const ciphertext = ciphertextResult.okValue!;

    let lastError: any = '';
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        onStatus?.(attempt === 1
            ? 'Requesting ACE decryption key from workers...'
            : `Retrying ACE key request (attempt ${attempt}/${MAX_RETRIES})...`);

        const decKeyResult = await ace.DecryptionKey.fetch({ committee, contractId, domain, proof });

        if (decKeyResult.isOk) {
            const decryptionKey = decKeyResult.okValue!;

            onStatus?.('Decrypting file...');
            const plainResult = ace.decrypt({ decryptionKey, ciphertext });
            if (!plainResult.isOk) {
                throw new Error(`ACE inner decryption failed: ${plainResult.errValue}`);
            }

            return plainResult.okValue!;
        }

        // Handle error and retry
        lastError = decKeyResult.errValue;
        console.warn(`[ACE] Attempt ${attempt} failed: ${lastError}`);
        
        // Log individual worker results if available in the 'extra' field
        if ((decKeyResult as any).extra) {
            console.dir((decKeyResult as any).extra);
        }

        const errStr = String(lastError).toLowerCase();
        const isRetryable = errStr.includes('insufficient shares')
            || errStr.includes('unavailable')
            || errStr.includes('timeout');

        if (!isRetryable || attempt === MAX_RETRIES) {
            throw new Error(`ACE workers denied access or are unavailable after ${attempt} attempts: ${lastError}`);
        }

        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        onStatus?.(`Workers indexing on-chain state... retrying in ${delay / 1000}s`);
        console.warn(`[ACE] Attempt ${attempt} failed (${lastError}). Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
    }

    throw new Error(`ACE workers denied access or are unavailable after ${MAX_RETRIES} attempts: ${lastError}`);
}

/**
 * Build a ProofOfPermission from wallet adapter objects.
 * 
 * Wallet adapters wrap keys/sigs in AnyPublicKey/AnySignature (or deeper).
 * The ACE SDK only recognizes raw Ed25519PublicKey.
 * 
 * Strategy: convert to hex string → extract raw Ed25519 bytes → create fresh instances.
 * This works regardless of how deeply the wallet adapter nests the key.
 */
export function buildAceProofOfPermission(params: {
    accountAddress: string;
    publicKey: PublicKey;
    signature: Signature;
    fullMessage: string;
}): ace.ProofOfPermission {
    const userAddr = AccountAddress.from(params.accountAddress);

    // --- Extract raw Ed25519 public key (32 bytes = 64 hex chars) ---
    // Try multiple extraction strategies in order of reliability:
    let pkHex: string;
    const pk = params.publicKey as any;

    // Strategy 1: Deep unwrap via duck typing then hex
    let innerPk = pk;
    for (let depth = 0; depth < 5; depth++) {
        if (innerPk.publicKey && typeof innerPk.publicKey.toString === 'function') {
            innerPk = innerPk.publicKey;
        } else {
            break;
        }
    }
    pkHex = (innerPk.toString?.() || pk.toString()).replace(/^0x/i, '');
    console.log(`[ACE] Raw PK hex length: ${pkHex.length} chars (${pkHex.length / 2} bytes)`);

    // Ed25519 = 32 bytes = 64 hex chars
    let finalPkHex: string;
    if (pkHex.length === 64) {
        finalPkHex = pkHex;
    } else if (pkHex.length === 66) {
        // AnyPublicKey format: 1 byte scheme + 32 bytes key
        finalPkHex = pkHex.slice(2);
    } else if (pkHex.length > 64) {
        // Complex key — take last 64 chars (raw Ed25519 key is always at the end)
        finalPkHex = pkHex.slice(-64);
        console.log(`[ACE] Extracted last 32 bytes from ${pkHex.length / 2}-byte key`);
    } else {
        throw new Error(`[ACE] Public key too short: ${pkHex.length / 2} bytes`);
    }
    const finalPublicKey = new Ed25519PublicKey('0x' + finalPkHex);

    // --- Extract raw Ed25519 signature (64 bytes = 128 hex chars) ---
    const sig = params.signature as any;
    let innerSig = sig;
    for (let depth = 0; depth < 5; depth++) {
        if (innerSig.signature && typeof innerSig.signature.toString === 'function') {
            innerSig = innerSig.signature;
        } else {
            break;
        }
    }
    let sigHex = (innerSig.toString?.() || sig.toString()).replace(/^0x/i, '');
    console.log(`[ACE] Raw Sig hex length: ${sigHex.length} chars (${sigHex.length / 2} bytes)`);

    let finalSigHex: string;
    if (sigHex.length === 128) {
        finalSigHex = sigHex;
    } else if (sigHex.length === 130) {
        finalSigHex = sigHex.slice(2);
    } else if (sigHex.length > 128) {
        finalSigHex = sigHex.slice(-128);
        console.log(`[ACE] Extracted last 64 bytes from ${sigHex.length / 2}-byte sig`);
    } else {
        throw new Error(`[ACE] Signature too short: ${sigHex.length / 2} bytes`);
    }
    const finalSignature = new Ed25519Signature('0x' + finalSigHex);

    console.log(`[ACE] Final PK: 0x${finalPkHex.slice(0, 16)}... (32B) ✓`);
    console.log(`[ACE] Final Sig: 0x${finalSigHex.slice(0, 16)}... (64B) ✓`);

    return ace.ProofOfPermission.createAptos({
        userAddr,
        publicKey: finalPublicKey,
        signature: finalSignature,
        fullMessage: params.fullMessage,
    });
}

/**
 * Legacy fallback: build ProofOfPermission from hex strings.
 * Use `buildAceProofOfPermission` with native objects when possible.
 */
export function buildAceProofOfPermissionFromHex(params: {
    accountAddress: string;
    publicKeyHex: string;
    signatureHex: string;
    fullMessage: string;
}): ace.ProofOfPermission {
    const userAddr = AccountAddress.from(params.accountAddress);

    // Normalize public key hex
    const pubHex = params.publicKeyHex.startsWith('0x')
        ? params.publicKeyHex.slice(2)
        : params.publicKeyHex;
    let finalPubHex: string;
    if (pubHex.length === 64) {
        finalPubHex = pubHex;
    } else if (pubHex.length === 66) {
        finalPubHex = pubHex.slice(2);
    } else if (pubHex.length > 64) {
        finalPubHex = pubHex.slice(-64);
    } else {
        throw new Error(`[ACE] Public key too short: ${pubHex.length / 2} bytes`);
    }
    const publicKey = new Ed25519PublicKey('0x' + finalPubHex);

    // Normalize signature hex
    const rawSigHex = params.signatureHex.startsWith('0x')
        ? params.signatureHex.slice(2)
        : params.signatureHex;
    let finalSigHex: string;
    if (rawSigHex.length === 128) {
        finalSigHex = rawSigHex;
    } else if (rawSigHex.length === 130) {
        finalSigHex = rawSigHex.slice(2);
    } else if (rawSigHex.length > 128) {
        finalSigHex = rawSigHex.slice(-128);
    } else {
        throw new Error(`[ACE] Signature too short: ${rawSigHex.length / 2} bytes`);
    }
    const signature = new Ed25519Signature('0x' + finalSigHex);

    return ace.ProofOfPermission.createAptos({
        userAddr,
        publicKey,
        signature,
        fullMessage: params.fullMessage,
    });
}
