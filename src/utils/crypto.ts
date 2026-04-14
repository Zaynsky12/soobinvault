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
        
        console.log("[ACE Debug] Starting decryption for blob:", blobName);
        console.log("[ACE Debug] Wallet state:", { 
            hasAccount: !!account, 
            addr: account?.address?.toString(),
            hasSignMessage: !!signMessage 
        });

        // 1. Request wallet signature for authentication proof
        let signOutput: any;
        try {
            // Give the wallet adapter a moment to sync if this was triggered immediately after a render
            await new Promise(r => setTimeout(r, 100));

            signOutput = await signMessage({ 
                message: fullDecryptionDomain.toPrettyMessage(), 
                nonce: "ace_auth" 
            });
        } catch (signErr: any) {
            console.error("[ACE Sign Error]", signErr);
            const errMsg = signErr.message || String(signErr);
            if (signErr.name === 'WalletNotConnectedError' || errMsg.includes('not connected') || errMsg.includes('No wallet')) {
                throw new Error("Wallet connection lost or not initialized. Please refresh the page and ensure your wallet is unlocked.");
            }
            throw signErr;
        }

        // 2. Normalize Public Key (Fixes "unsupported public key type" errors)
        let rawPubKeyBytes: Uint8Array | null = null;
        let pubKeyHex = "";
        
        if (account && account.publicKey) {
            const pk: any = account.publicKey;
            console.log("[ACE Debug] raw account.publicKey details:", {
                type: typeof pk,
                constructor: pk.constructor?.name,
                hasToUint8Array: typeof pk.toUint8Array === 'function',
                hasToString: typeof pk.toString === 'function'
            });

            if (pk instanceof Uint8Array) {
                rawPubKeyBytes = pk;
            } else if (typeof pk.toUint8Array === 'function') {
                rawPubKeyBytes = pk.toUint8Array();
            } else if (typeof pk === 'string') {
                pubKeyHex = pk;
            } else if (typeof pk.toString === 'function') {
                const s = pk.toString();
                if (s !== "[object Object]") pubKeyHex = s;
            }
            
            if (!rawPubKeyBytes && pubKeyHex) {
                const cleanHex = pubKeyHex.startsWith('0x') ? pubKeyHex.substring(2) : pubKeyHex;
                rawPubKeyBytes = new Uint8Array(cleanHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
            }
        }
        
        if (!rawPubKeyBytes) throw new Error("Could not extract raw public key bytes from wallet.");
        const finalHex = "0x" + Array.from(rawPubKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');

        // CONSTRUCT THE "GOD OBJECT" POLYFILL
        // This object mirrors both Aptos SDK v1 and v2 Ed25519PublicKey interfaces.
        // The objective is to satisfy internal checks like 'instanceof' (if lucky) or 
        // property-based scheme detection (getScheme, .type, .scheme, ._type).
        const robustPubKey: any = {
            // Data properties
            publicKey: rawPubKeyBytes,
            buffer: rawPubKeyBytes, // Legacy v1
            value: rawPubKeyBytes,  // Legacy v1
            bytes: rawPubKeyBytes,  // v2
            
            // Core identification properties (Crucial for ACE)
            type: 0,                // Ed25519 enum
            scheme: 0,              // Ed25519 enum
            _type: "Ed25519",       // Marker
            variant: 0,             // v2 marker
            identifier: "Ed25519",
            
            // Methods
            toUint8Array: () => rawPubKeyBytes!,
            toString: () => finalHex,
            toBuffer: () => rawPubKeyBytes!, // Fallback for browsers
            getScheme: () => 0,
            getVariant: () => 0,
            
            // Mocking class structure if checked via constructor name
            constructor: { name: "Ed25519PublicKey" }
        };

        console.log("[ACE Debug] Robust Polyfill constructed for hex:", finalHex.substring(0, 10) + "...");

        // 3. Normalize Signature
        const sigAny: any = signOutput.signature;
        let finalSignature: string;

        if (typeof sigAny === 'string') {
            finalSignature = sigAny;
        } else if (sigAny instanceof Uint8Array || Array.isArray(sigAny)) {
            finalSignature = Array.from(sigAny as any).map((b: any) => b.toString(16).padStart(2, '0')).join('');
        } else {
            finalSignature = sigAny?.toString('hex') || String(sigAny);
        }

        if (finalSignature && !finalSignature.startsWith('0x') && /^[0-9a-fA-F]+$/.test(finalSignature)) {
            finalSignature = `0x${finalSignature}`;
        }

        // 4. Create Proof of Permission
        // We pass the robust polyfill object as any. 
        // We also ensure userAddr is an AccountAddress object.
        const proof = ace.ProofOfPermission.createAptos({
            userAddr: AccountAddress.fromString(account.address.toString()) as any,
            publicKey: robustPubKey as any,
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
