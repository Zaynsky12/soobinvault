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
import { AccountAddress, Ed25519PublicKey, Ed25519Signature } from '@aptos-labs/ts-sdk';
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
 */
export async function aceDecryptBuffer(
    ciphertextBytes: Uint8Array,
    blobName: string,
    proof: ace.ProofOfPermission,
    onStatus?: (msg: string) => void
): Promise<Uint8Array> {
    onStatus?.('Requesting ACE decryption key from workers...');
    const committee = buildAceCommittee();
    const contractId = buildAceContractId();
    const domain = new TextEncoder().encode(blobName);

    const decKeyResult = await ace.DecryptionKey.fetch({ committee, contractId, domain, proof });
    if (!decKeyResult.isOk) {
        throw new Error(`ACE workers denied access or are unavailable: ${decKeyResult.errValue}`);
    }
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

/**
 * Build a ProofOfPermission from a wallet signMessage response.
 * Works with Petra and Aptos Connect wallet formats.
 */
export function buildAceProofOfPermission(params: {
    accountAddress: string;
    publicKeyHex: string;
    signatureHex: string;
    fullMessage: string;
}): ace.ProofOfPermission {
    const userAddr = AccountAddress.from(params.accountAddress);

    // Normalize hex strings (strip 0x prefix for length analysis)
    const pubHex = params.publicKeyHex.startsWith('0x')
        ? params.publicKeyHex.slice(2)
        : params.publicKeyHex;

    // Wallet adapters may return AnyPublicKey format (33 bytes = 66 hex chars):
    //   byte 0 = scheme (0x00 for Ed25519)
    //   bytes 1-32 = raw Ed25519 key
    // Bare Ed25519PublicKey is 32 bytes (64 hex chars).
    // Ed25519PublicKey constructor requires exactly 32 bytes, so strip the prefix if present.
    const finalPubHex = pubHex.length === 66 ? pubHex.slice(2) : pubHex;
    const publicKey = new Ed25519PublicKey('0x' + finalPubHex);

    // Normalize signature (strip 0x prefix if present)
    const sigHex = params.signatureHex.startsWith('0x')
        ? params.signatureHex
        : '0x' + params.signatureHex;
    const signature = new Ed25519Signature(sigHex);

    return ace.ProofOfPermission.createAptos({
        userAddr,
        publicKey,
        signature,
        fullMessage: params.fullMessage,
    });
}
