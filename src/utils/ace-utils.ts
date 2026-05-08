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
        functionName: 'can_decrypt',  // 2-arg signature: (user_addr, domain) — matches ACE SDK workers
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

    // Retry config: up to 3 attempts, delays of 3s → 6s → 12s
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 3000;

    let lastError = '';
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        onStatus?.(attempt === 1
            ? 'Requesting ACE decryption key from workers...'
            : `Retrying ACE key request (attempt ${attempt}/${MAX_RETRIES})...`);

        const decKeyResult = await ace.DecryptionKey.fetch({ committee, contractId, domain, proof });

        if (decKeyResult.isOk) {
            const decryptionKey = decKeyResult.okValue!;

            onStatus?.('Decrypting file...');
            const ciphertextResult = ace.Ciphertext.fromBytes(ciphertextBytes);
            if (!ciphertextResult.isOk) {
                throw new Error(`Invalid ACE ciphertext: ${ciphertextResult.errValue}`);
            }

            const plainResult = ace.decrypt({ decryptionKey, ciphertext: ciphertextResult.okValue! });
            if (!plainResult.isOk) {
                throw new Error(`ACE decryption failed: ${plainResult.errValue}`);
            }

            return plainResult.okValue!;
        }

        lastError = String(decKeyResult.errValue);
        const isRetryable = lastError.toLowerCase().includes('insufficient shares')
            || lastError.toLowerCase().includes('unavailable')
            || lastError.toLowerCase().includes('timeout');

        if (!isRetryable || attempt === MAX_RETRIES) {
            // Permission explicitly denied or non-retryable error — stop immediately
            break;
        }

        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 3s, 6s, 12s
        onStatus?.(`Workers indexing on-chain state... retrying in ${delay / 1000}s`);
        console.warn(`[ACE] Attempt ${attempt} failed (${lastError}). Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
    }

    throw new Error(`ACE workers denied access or are unavailable after ${MAX_RETRIES} attempts: ${lastError}`);
}

/**
 * Build a ProofOfPermission from wallet adapter objects.
 *
 * KEY INSIGHT from ACE SDK source (verifyPermission → checkAuthKey):
 * Workers call `publicKey.authKey().bcsToBytes()` and compare to on-chain auth key.
 * This ONLY works when passing the ORIGINAL wallet publicKey object (Ed25519PublicKey
 * or AnyPublicKey), NOT a manually reconstructed one from raw hex bytes.
 *
 * The ACE SDK ProofOfPermission accepts Ed25519PublicKey, AnyPublicKey, MultiKey, etc.
 * so we pass the wallet objects directly without any conversion.
 */
export function buildAceProofOfPermission(params: {
    accountAddress: string;
    publicKey: PublicKey;
    signature: Signature;
    fullMessage: string;
}): ace.ProofOfPermission {
    const userAddr = AccountAddress.from(params.accountAddress);
    console.log(`[ACE] Building proof for ${params.accountAddress}`);
    
    // --- Re-instantiate Public Key to satisfy strict instanceof checks ---
    let publicKey: any = params.publicKey;
    try {
        const pkBytes = params.publicKey.toUint8Array();
        const typeName = (params.publicKey as any).constructor?.name;
        
        // AUTO-DETECT: If it's already AnyPublicKey or 33 bytes, keep it as Any.
        // If it's 32 bytes, use Ed25519.
        if (typeName === 'AnyPublicKey' || pkBytes.length === 33) {
            const rawPkBytes = pkBytes.length === 33 ? pkBytes.slice(1) : pkBytes;
            publicKey = new AnyPublicKey(new Ed25519PublicKey(rawPkBytes));
            console.log('[ACE] Re-instantiated as AnyPublicKey');
        } else {
            publicKey = new Ed25519PublicKey(pkBytes.slice(-32));
            console.log('[ACE] Re-instantiated as Ed25519PublicKey');
        }
    } catch (e) {
        console.warn('[ACE] Re-instantiation failed', e);
    }

    // --- Re-instantiate Signature ---
    let signature: any = params.signature;
    try {
        const sigBytes = (params.signature as any).toUint8Array?.() || (params.signature as any).data;
        if (sigBytes) {
            const sigTypeName = (params.signature as any).constructor?.name;
            if (sigTypeName === 'AnySignature' || sigBytes.length === 65) {
                const rawSigBytes = sigBytes.length === 65 ? sigBytes.slice(1) : sigBytes;
                signature = new AnySignature(new Ed25519Signature(rawSigBytes));
                console.log('[ACE] Re-instantiated as AnySignature');
            } else {
                signature = new Ed25519Signature(sigBytes.slice(-64));
                console.log('[ACE] Re-instantiated as Ed25519Signature');
            }
        }
    } catch (e) {
        console.warn('[ACE] Signature re-instantiation failed', e);
    }

    return ace.ProofOfPermission.createAptos({
        userAddr,
        publicKey,
        signature,
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
