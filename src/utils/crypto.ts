// Implements client-side AES-256-GCM encryption and robust ACE decryption normalization.
import { ace } from "@aptos-labs/ace-sdk";
import { AccountAddress, Ed25519PublicKey, Ed25519Signature } from "@aptos-labs/ts-sdk";
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

        // CANONICAL: Ensure the domain is strictly lowercase to match registry parity
        const canonicalBlobName = blobName.toLowerCase();
        const domain = new TextEncoder().encode(canonicalBlobName);
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
                nonce: "" // Documentation uses empty nonce by default
            });
            console.log("[ACE Debug] Wallet signOutput:", JSON.stringify(signOutput));
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
        
        if (account && account.publicKey) {
            const pk: any = account.publicKey;
            if (pk instanceof Uint8Array) {
                rawPubKeyBytes = pk;
            } else if (typeof pk.toUint8Array === 'function') {
                rawPubKeyBytes = pk.toUint8Array();
            } else if (typeof pk === 'string') {
                const cleanHex = pk.startsWith('0x') ? pk.substring(2) : pk;
                rawPubKeyBytes = new Uint8Array(cleanHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
            } else if (pk && typeof pk.toString === 'function') {
                const s = pk.toString();
                if (s && s !== "[object Object]") {
                    const cleanHex = s.startsWith('0x') ? s.substring(2) : s;
                    if (/^[0-9a-fA-F]+$/.test(cleanHex)) {
                        rawPubKeyBytes = new Uint8Array(cleanHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
                    }
                }
            }
        }
        
        if (!rawPubKeyBytes) throw new Error("Could not extract raw public key bytes from wallet.");
        
        console.log(`[ACE Debug] Extracted Public Key bytes (Length: ${rawPubKeyBytes.length})`);

        // SMART HANDLING: 
        // 1. Standard Ed25519 (32 bytes) or prefixed Ed25519 (33 bytes with 0x00)
        // 2. Large Keys (Keyless/Multi-sig/Single-key-wrapped) - DO NOT SLICE these!
        let robustPubKey: any;
        
        if (rawPubKeyBytes.length === 32) {
            robustPubKey = new Ed25519PublicKey(rawPubKeyBytes);
        } else if (rawPubKeyBytes.length === 33 && rawPubKeyBytes[0] === 0x00) {
            console.log("[ACE Debug] Slicing 33-byte prefixed Ed25519 key.");
            robustPubKey = new Ed25519PublicKey(rawPubKeyBytes.slice(1));
        } else {
            // Advanced Signature Type (Keyless, etc.)
            console.log("[ACE Debug] Advanced Public Key detected. Passing through full bytes.");
            // We instantiate as Ed25519 to satisfy ACE SDK's type checks, but with FULL bytes.
            robustPubKey = new Ed25519PublicKey(rawPubKeyBytes);
        }
        
        // POLYFILL: ACE SDK (specifically getPublicKeyScheme) expects these legacy markers
        (robustPubKey as any).type = 0;
        (robustPubKey as any).scheme = 0;
        (robustPubKey as any)._type = "Ed25519";
        (robustPubKey as any).kind = 0;
        (robustPubKey as any).identifier = "Ed25519";
        if (!(robustPubKey as any).getScheme) (robustPubKey as any).getScheme = () => 0;

        console.log("[ACE Debug] Key Handling: Instantiated Ed25519PublicKey with polyfill markers.");

        // 3. Normalize Signature
        const sigAny: any = signOutput.signature;
        let rawSigBytes: Uint8Array | null = null;
        
        if (typeof sigAny === 'string') {
            const cleanHex = sigAny.startsWith('0x') ? sigAny.substring(2) : sigAny;
            rawSigBytes = new Uint8Array(cleanHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
        } else if (sigAny instanceof Uint8Array) {
            rawSigBytes = sigAny;
        } else if (Array.isArray(sigAny)) {
            rawSigBytes = new Uint8Array(sigAny);
        } else if (sigAny && typeof sigAny.toUint8Array === 'function') {
            rawSigBytes = sigAny.toUint8Array();
        } else if (sigAny && typeof sigAny.toString === 'function') {
            const s = sigAny.toString();
            if (s && s !== "[object Object]") {
                const cleanHex = s.startsWith('0x') ? s.substring(2) : s;
                if (/^[0-9a-fA-F]+$/.test(cleanHex)) {
                    rawSigBytes = new Uint8Array(cleanHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)));
                }
            }
        }

        if (!rawSigBytes) throw new Error("Could not extract raw signature bytes from wallet.");
        
        console.log(`[ACE Debug] Extracted Signature bytes (Length: ${rawSigBytes.length})`);

        // SMART HANDLING:
        // 1. Standard Ed25519 (64 bytes) or prefixed Ed25519 (65 bytes with 0x00)
        // 2. Large Signatures (Keyless ZK Proofs, etc.) - DO NOT SLICE these!
        let robustSignature: any;

        if (rawSigBytes.length === 64) {
            robustSignature = new Ed25519Signature(rawSigBytes);
        } else if (rawSigBytes.length === 65 && rawSigBytes[0] === 0x00) {
            console.log("[ACE Debug] Slicing 65-byte prefixed Ed25519 signature.");
            robustSignature = new Ed25519Signature(rawSigBytes.slice(1));
        } else {
            console.log("[ACE Debug] Advanced Signature detected (Keyless/Large). Preserving whole proof.");
            // Instantiate as Ed25519Signature with FULL bytes to satisfy SDK constructor checks
            robustSignature = new Ed25519Signature(rawSigBytes);
        }
        
        // POLYFILL: ACE SDK expects these markers for getSignatureScheme
        (robustSignature as any).type = 0; 
        (robustSignature as any)._type = "Ed25519";
        (robustSignature as any).identifier = "Ed25519";
        (robustSignature as any).scale_type = "Ed25519Signature";

        console.log("[ACE Debug] Signature Handling: Instantiated Ed25519Signature with polyfill markers.");

        // 4. Create Proof of Permission
        // RECONSTRUCTION & VERIFICATION:
        // We MUST use the exact fullMessage that the wallet signed.
        // If the wallet (like Petra) provides it, we use it directly. This is the gold standard for signature parity.
        // Otherwise, we fall back to manual reconstruction using Aptos standard prefixes (AIP-26).
        let finalFullMessage: string = "";
        
        if (signOutput && (signOutput as any).fullMessage) {
            finalFullMessage = (signOutput as any).fullMessage;
            console.log("[ACE Debug] Using wallet-provided fullMessage (Signature Parity Guaranteed).");
        } else {
            console.log("[ACE Debug] Wallet did not provide fullMessage; reconstructing manually...");
            const msg = fullDecryptionDomain.toPrettyMessage();
            const nonce = ""; // Matches the empty nonce used in signMessage call above
            finalFullMessage = `APTOS\nmessage: ${msg}\nnonce: ${nonce}`;
        }

        // Get signature as hex string (required for some SDK constructor internal parsing)
        const signatureHex = Array.from(rawSigBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        const finalSignature = signatureHex.startsWith('0x') ? signatureHex : `0x${signatureHex}`;

        console.log("[ACE Debug] Proof payload parameters:", {
            address: AccountAddress.fromString(account.address.toString()).toStringLong(),
            hasFullMessage: !!finalFullMessage,
            messageLength: finalFullMessage.length,
            canonicalBlobName
        });

        const proof = ace.ProofOfPermission.createAptos({
            userAddr: AccountAddress.fromString(account.address.toString()) as any,
            publicKey: robustPubKey as any,
            signature: robustSignature as any,
            fullMessage: finalFullMessage,
        });

        console.log("[ACE Debug] Proof of Permission created. Fetching key from committee...");

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
