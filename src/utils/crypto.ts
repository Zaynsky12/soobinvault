// Implements client-side AES-256-GCM encryption and robust ACE decryption normalization.
import { ace } from "@aptos-labs/ace-sdk";
import { AccountAddress, Ed25519PublicKey } from "@aptos-labs/ts-sdk";
import { MARKETPLACE_REGISTRY_ADDRESS } from "../lib/constants";

const ITERATIONS = 100000;
const KEY_LEN = 256;
const ALGORITHM = 'AES-GCM';

interface FileMetadata {
    name: string;
    type: string;
    size: number;
}

/**
 * Derives a 256-bit AES key from a wallet signature using SHA-256.
 * Salt (account address) added for better cross-device determinism.
 */
export async function deriveKeyFromSignature(signature: string, salt?: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    
    // Normalize signature (remove 0x prefix if it exists and lowercase)
    const normalizedSig = signature.toLowerCase().startsWith('0x') 
        ? signature.toLowerCase().slice(2) 
        : signature.toLowerCase();
        
    // Combine signature with salt if provided
    const keyData = salt ? (normalizedSig + salt.toLowerCase()) : normalizedSig;
    const keyBytes = encoder.encode(keyData);
    
    // Hash the normalized data to get a deterministic 256-bit (32-byte) key
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', keyBytes);
    
    // Import the hash as a raw key for AES-GCM
    return window.crypto.subtle.importKey(
        'raw',
        hashBuffer,
        { name: ALGORITHM, length: KEY_LEN },
        true, // Set to true to allow fingerprinting/debugging
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts a file's content and embeds metadata.
 * Format: IV (12 bytes) + Encrypted(Metadata_Size (4) + Metadata_JSON + File_Data)
 * Optimized to minimize intermediate buffer duplications.
 */
export async function encryptFile(file: File, key: CryptoKey): Promise<Blob> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    // Create Metadata Header
    const metadata: FileMetadata = {
        name: file.name,
        type: file.type,
        size: file.size
    };
    const metadataStr = JSON.stringify(metadata);
    const metadataBuffer = new TextEncoder().encode(metadataStr);
    
    // Efficiently combine Meta + Data without manual new Uint8Array(TOTAL) allocation of plaintext
    // unless absolutely required by the Web Crypto API.
    // Note: SubtleCrypto.encrypt unfortunately requires a single BufferSource.
    // For large files (>100MB), this is the main RAM bottleneck.
    
    const headerSize = new DataView(new ArrayBuffer(4));
    headerSize.setUint32(0, metadataBuffer.byteLength);
    
    // Construct the plaintext using a Blob to let the browser manage memory
    const plaintextBlob = new Blob([
        headerSize.buffer,
        metadataBuffer,
        file
    ]);
    
    const plaintextBuffer = await plaintextBlob.arrayBuffer();
    
    // Encrypt the entire block
    const ciphertext = await window.crypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        key,
        plaintextBuffer
    );

    // Final Payload: IV + Ciphertext as a Blob (Memory efficient)
    return new Blob([iv, ciphertext]);
}

/**
 * Decrypts a buffer and extracts the original file and metadata.
 */
export async function decryptFile(
    encryptedData: ArrayBuffer | Uint8Array,
    key: CryptoKey
): Promise<{ blob: Blob; metadata: FileMetadata }> {
    // Handle both ArrayBuffer and Uint8Array/other views
    const data = encryptedData instanceof Uint8Array 
        ? encryptedData 
        : new Uint8Array(encryptedData);

    if (data.byteLength < 12 + 16) { // IV (12) + Tag (at least 16)
        throw new Error(`Invalid encrypted data: buffer too small (${data.byteLength} bytes)`);
    }

    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);

    try {
        // Decrypt
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: ALGORITHM, iv },
            key,
            ciphertext
        );

        // Parse Header
        const view = new DataView(decryptedBuffer);
        const headerSize = view.getUint32(0);
        const metadataBuffer = decryptedBuffer.slice(4, 4 + headerSize);
        const fileData = decryptedBuffer.slice(4 + headerSize);

        const metadataStr = new TextDecoder().decode(metadataBuffer);
        const metadata: FileMetadata = JSON.parse(metadataStr);

        const blob = new Blob([fileData], { type: metadata.type });
        return { blob, metadata };
    } catch (err) {
        console.error("Decryption operation failed:", err);
        throw new Error("Failed to decrypt file. Ensure the data is not corrupted and the session key is valid.");
    }
}

/**
 * Encrypts a small string (e.g. filename) for metadata storage.
 */
export async function encryptText(text: string, key: CryptoKey): Promise<string> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    
    const ciphertext = await window.crypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        key,
        encoded
    );

    // Combine IV + Ciphertext and convert to Base64 for metadata storage
    const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.byteLength);
    
    return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts a base64 encoded encrypted string.
 */
export async function decryptText(encryptedBase64: string, key: CryptoKey): Promise<string> {
    const combined = new Uint8Array(
        atob(encryptedBase64).split("").map(c => c.charCodeAt(0))
    );
    
    if (combined.byteLength < 12 + 16) throw new Error("Invalid encrypted text");
    
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    const decrypted = await window.crypto.subtle.decrypt(
        { name: ALGORITHM, iv },
        key,
        ciphertext
    );
    
    return new TextDecoder().decode(decrypted);
}

/**
 * ACE (Access Control Encryption) Decryption Utility
 * Consolidates complex key/signature normalization and SDK interaction.
 */
export async function decryptAceFile({
    rawBuffer,
    blobName,
    account,
    signMessage,
}: {
    rawBuffer: Uint8Array;
    blobName: string;
    account: any;
    signMessage: (msg: { message: string; nonce: string }) => Promise<any>;
}): Promise<Uint8Array> {
    if (!account || !account.address || !signMessage) {
        throw new Error("Wallet not connected. Please connect your wallet to access encrypted content.");
    }

    try {
        const committee = new ace.Committee({
            workerEndpoints: [
                "https://ace-worker-0-646682240579.europe-west1.run.app",
                "https://ace-worker-1-646682240579.europe-west1.run.app",
            ],
            threshold: 2,
        });

        const contractId = ace.ContractID.newAptos({
            chainId: 2, // Testnet
            moduleAddr: AccountAddress.fromString(MARKETPLACE_REGISTRY_ADDRESS),
            moduleName: "marketplace",
            functionName: "check_permission",
        });

        const domain = new TextEncoder().encode(blobName);
        const fullDecryptionDomain = new ace.FullDecryptionDomain({ contractId, domain });
        
        // 1. Request wallet signature for authentication proof
        const signOutput = await signMessage({ 
            message: fullDecryptionDomain.toPrettyMessage(), 
            nonce: "ace_auth" 
        });

        // 2. Normalize Public Key (Fixes "unsupported public key type" errors)
        let pubKeyObj: any = null;
        
        console.log("[ACE Debug] Raw account.publicKey type:", typeof account?.publicKey);
        
        if (account && account.publicKey) {
            const pk: any = account.publicKey;
            
            // If it's already an object, attempt to pass it directly but add polyfills
            if (typeof pk === 'object' && pk !== null) {
                pubKeyObj = pk;
            } else {
                // If it's a string, we MUST wrap it in a proper PublicKey object
                const pkStr = pk.toString();
                const clean = pkStr.startsWith('0x') ? pkStr.substring(2) : pkStr;
                try {
                    pubKeyObj = new Ed25519PublicKey(clean);
                } catch (e) {
                    console.error("[ACE Debug] Failed to wrap public key string:", e);
                }
            }
        }
        
        if (!pubKeyObj) throw new Error("Could not extract a valid public key from wallet.");

        // IMPORTANT POLYFILL: ACE SDK (Aptos v1 based) checks for .type or .scheme
        // Aptos v2 objects may not have these, or have different ones.
        try {
            // Legacy properties (v1)
            (pubKeyObj as any).type = 0; // 0 = Ed25519 in legacy
            (pubKeyObj as any).scheme = 0; 
            
            // Aptos v2 variants
            (pubKeyObj as any).variant = 0;
            
            // Legacy getter methods
            if (typeof (pubKeyObj as any).getScheme !== 'function') {
                (pubKeyObj as any).getScheme = () => 0;
            }
            if (typeof (pubKeyObj as any).getVariant !== 'function') {
                (pubKeyObj as any).getVariant = () => 0;
            }
            // Method-style (used in some SDK versions)
            (pubKeyObj as any).scheme = () => 0;
            (pubKeyObj as any).variant = () => 0;
            
            // Add a toString method if missing (some SDK checks use it)
            if (typeof pubKeyObj.toString !== 'function') {
                pubKeyObj.toString = () => pubKeyObj.toUint8Array ? Array.from(pubKeyObj.toUint8Array()).map((b: any) => b.toString(16).padStart(2, '0')).join('') : "";
            }
        } catch (polyfillError) {
            console.warn("[ACE Debug] Could not polyfill public key object:", polyfillError);
        }

        console.log("[ACE Debug] Final Public Key Object Keys:", Object.keys(pubKeyObj));

        // 3. Normalize Signature
        const sigAny: any = signOutput.signature;
        let finalSignature = typeof sigAny === 'string' ? sigAny : sigAny?.toString('hex') || sigAny;
        if (finalSignature && !finalSignature.startsWith('0x')) {
            finalSignature = `0x${finalSignature}`;
        }

        // 4. Create Proof of Permission
        // We pass the polyfilled object as any. 
        // We also ensure userAddr is an AccountAddress object.
        const proof = ace.ProofOfPermission.createAptos({
            userAddr: AccountAddress.fromString(account.address.toString()) as any,
            publicKey: pubKeyObj as any,
            signature: finalSignature as any,
            fullMessage: (signOutput as any).fullMessage,
        });

        // 5. Fetch Decryption Key from Committee
        const decryptionKeyResult = await ace.DecryptionKey.fetch({
            committee,
            contractId,
            domain,
            proof,
        });

        // 6. Decrypt Ciphertext
        const decipheredResult = ace.decrypt({
            decryptionKey: decryptionKeyResult.unwrapOrThrow(new Error("Missing decryption key")),
            ciphertext: ace.Ciphertext.fromBytes(rawBuffer).unwrapOrThrow(new Error("Corrupted or invalid encrypted blob on network")),
        });
        
        return decipheredResult.unwrapOrThrow(new Error("Failed to decipher text"));
    } catch (aceError: any) {
        console.error("[ACE Decryption Utility Error]", aceError);
        throw new Error(aceError.message || "Failed to decipher dataset. Ensure you have purchased it or are the owner.");
    }
}
