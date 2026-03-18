/**
 * SoobinVault Crypto Utilities
 * Implements client-side AES-256-GCM encryption for zero-knowledge storage.
 */

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
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts a file's content and embeds metadata.
 * Format: IV (12 bytes) + Encrypted(Metadata_Size (4) + Metadata_JSON + File_Data)
 */
export async function encryptFile(file: File, key: CryptoKey): Promise<Uint8Array> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const fileBuffer = await file.arrayBuffer();

    // Create Metadata Header
    const metadata: FileMetadata = {
        name: file.name,
        type: file.type,
        size: file.size
    };
    const metadataStr = JSON.stringify(metadata);
    const metadataBuffer = new TextEncoder().encode(metadataStr);
    const headerSize = new DataView(new ArrayBuffer(4));
    headerSize.setUint32(0, metadataBuffer.byteLength);

    // Combine Header + Original Data
    const combinedBuffer = new Uint8Array(4 + metadataBuffer.byteLength + fileBuffer.byteLength);
    combinedBuffer.set(new Uint8Array(headerSize.buffer), 0);
    combinedBuffer.set(metadataBuffer, 4);
    combinedBuffer.set(new Uint8Array(fileBuffer), 4 + metadataBuffer.byteLength);

    // Encrypt
    const ciphertext = await window.crypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        key,
        combinedBuffer
    );

    // Final Payload: IV + Ciphertext
    const payload = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    payload.set(iv, 0);
    payload.set(new Uint8Array(ciphertext), iv.byteLength);

    return payload;
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
        throw new Error("Gagal mendekripsi file. Pastikan data tidak korup dan session key valid.");
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
