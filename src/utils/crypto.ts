// Implements client-side AES-256-GCM encryption and robust ACE decryption normalization.
import { ace } from "@aptos-labs/ace-sdk";
import {
    AccountAddress,
    AccountPublicKey,
    AnyPublicKey,
    AnySignature,
    Aptos,
    AptosConfig,
    Deserializer,
    Ed25519PublicKey,
    Ed25519Signature,
    KeylessPublicKey,
    FederatedKeylessPublicKey,
    KeylessSignature,
    MultiEd25519PublicKey,
    MultiEd25519Signature,
    MultiKey,
    MultiKeySignature,
    Network,
} from "@aptos-labs/ts-sdk";
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

        // DOMAIN PARITY: Use the blobName exactly as stored during encryption & registration.
        // The ACE encryption domain in VaultDropzone.tsx uses the raw marketName (NOT lowercased).
        // The BlobOwnership table stores it as-is via list_dataset.
        // Forcing .toLowerCase() here would produce mismatched domain bytes → check_permission returns false.
        const canonicalBlobName = blobName; // Preserve original casing for domain byte parity
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

        // 2. Resolve Public Key
        // STRATEGY: The wallet adapter's account.publicKey is ALREADY a properly typed
        // SDK object (Ed25519PublicKey, AnyPublicKey, KeylessPublicKey, etc.).
        // The ACE SDK performs strict instanceof checks — duck-typed objects WILL fail.
        // We MUST pass a real instance of a recognized class.
        let robustPubKey: AccountPublicKey;

        const rawPK: any = account.publicKey;
        console.log(`[ACE Debug] account.publicKey type: ${rawPK?.constructor?.name || typeof rawPK}`);

        if (
            rawPK instanceof Ed25519PublicKey ||
            rawPK instanceof AnyPublicKey ||
            rawPK instanceof MultiEd25519PublicKey ||
            rawPK instanceof MultiKey ||
            rawPK instanceof KeylessPublicKey ||
            rawPK instanceof FederatedKeylessPublicKey
        ) {
            // Already a proper typed instance — pass it directly.
            console.log("[ACE Debug] account.publicKey is already a recognized ACE-compatible type. Using directly.");
            robustPubKey = rawPK;
        } else {
            // Fallback: extract raw bytes and reconstruct
            console.log("[ACE Debug] account.publicKey is not a recognized type. Extracting bytes to reconstruct.");
            let rawPubKeyBytes: Uint8Array | null = null;
            if (rawPK instanceof Uint8Array) {
                rawPubKeyBytes = rawPK;
            } else if (typeof rawPK?.toUint8Array === 'function') {
                rawPubKeyBytes = rawPK.toUint8Array();
            } else if (typeof rawPK === 'string') {
                const h = rawPK.startsWith('0x') ? rawPK.substring(2) : rawPK;
                rawPubKeyBytes = new Uint8Array(h.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
            } else if (typeof rawPK?.toString === 'function') {
                const s = rawPK.toString();
                if (s && s !== '[object Object]') {
                    const h = s.startsWith('0x') ? s.substring(2) : s;
                    if (/^[0-9a-fA-F]+$/.test(h)) {
                        rawPubKeyBytes = new Uint8Array(h.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
                    }
                }
            }
            if (!rawPubKeyBytes) throw new Error('Could not extract public key bytes from wallet.');
            console.log(`[ACE Debug] Extracted key bytes: ${rawPubKeyBytes.length} bytes`);

            if (rawPubKeyBytes.length === 32) {
                robustPubKey = new Ed25519PublicKey(rawPubKeyBytes);
            } else if (rawPubKeyBytes.length === 33 && rawPubKeyBytes[0] === 0x00) {
                robustPubKey = new Ed25519PublicKey(rawPubKeyBytes.slice(1));
            } else {
                // Try to deserialize as AnyPublicKey from BCS bytes (wallet may give BCS-encoded key)
                try {
                    const deser = new Deserializer(rawPubKeyBytes);
                    robustPubKey = deser.deserialize(AnyPublicKey);
                    console.log("[ACE Debug] Deserialized AnyPublicKey from raw bytes.");
                } catch {
                    // Last resort: wrap a dummy 32-byte key in Ed25519 (will fail auth check, but gets past scheme check)
                    console.warn("[ACE Debug] Cannot reconstruct key from bytes — using placeholder Ed25519 key for scheme resolution.");
                    robustPubKey = new Ed25519PublicKey(rawPubKeyBytes.slice(0, 32));
                }
            }
        }

        console.log(`[ACE Debug] Final public key type: ${robustPubKey?.constructor?.name}`);

        // 3. Normalize Signature
        // STRATEGY: Similarly, try to use the sign output's typed object first.
        // Then try BCS deserialization as AnySignature. Fall back to Ed25519Signature.
        const sigOutputRaw: any = signOutput.signature;
        console.log(`[ACE Debug] signOutput.signature type: ${sigOutputRaw?.constructor?.name || typeof sigOutputRaw}`);

        let robustSignature: any;

        if (
            sigOutputRaw instanceof Ed25519Signature ||
            sigOutputRaw instanceof AnySignature ||
            sigOutputRaw instanceof MultiEd25519Signature ||
            sigOutputRaw instanceof MultiKeySignature ||
            sigOutputRaw instanceof KeylessSignature
        ) {
            // Already a proper typed signature object — pass directly.
            console.log("[ACE Debug] signOutput.signature is already a recognized ACE-compatible type. Using directly.");
            robustSignature = sigOutputRaw;
        } else {
            // Extract raw bytes from whatever format the wallet returns
            let rawSigBytes: Uint8Array | null = null;
            if (typeof sigOutputRaw === 'string') {
                const h = sigOutputRaw.startsWith('0x') ? sigOutputRaw.substring(2) : sigOutputRaw;
                rawSigBytes = new Uint8Array(h.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
            } else if (sigOutputRaw instanceof Uint8Array) {
                rawSigBytes = sigOutputRaw;
            } else if (Array.isArray(sigOutputRaw)) {
                rawSigBytes = new Uint8Array(sigOutputRaw);
            } else if (typeof sigOutputRaw?.toUint8Array === 'function') {
                rawSigBytes = sigOutputRaw.toUint8Array();
            } else if (typeof sigOutputRaw?.bcsToBytes === 'function') {
                rawSigBytes = sigOutputRaw.bcsToBytes();
            } else if (typeof sigOutputRaw?.toString === 'function') {
                const s = sigOutputRaw.toString();
                if (s && s !== '[object Object]') {
                    const h = s.startsWith('0x') ? s.substring(2) : s;
                    if (/^[0-9a-fA-F]+$/.test(h)) {
                        rawSigBytes = new Uint8Array(h.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
                    }
                }
            }

            if (!rawSigBytes) throw new Error('Could not extract signature bytes from wallet.');
            console.log(`[ACE Debug] Extracted signature bytes: ${rawSigBytes.length} bytes`);

            if (rawSigBytes.length === 64) {
                robustSignature = new Ed25519Signature(rawSigBytes);
                console.log("[ACE Debug] Constructed Ed25519Signature (64 bytes).");
            } else if (rawSigBytes.length === 65 && rawSigBytes[0] === 0x00) {
                robustSignature = new Ed25519Signature(rawSigBytes.slice(1));
                console.log("[ACE Debug] Constructed Ed25519Signature (sliced 65-byte prefixed).");
            } else {
                // Try BCS-deserializing as AnySignature (Keyless wallets often return a BCS-encoded AnySignature)
                try {
                    const deser = new Deserializer(rawSigBytes);
                    robustSignature = deser.deserialize(AnySignature);
                    console.log(`[ACE Debug] Deserialized AnySignature from bytes (variant: ${robustSignature.variant}).`);
                } catch (deserErr) {
                    // Last resort: truncate or pad to 64 bytes for Ed25519Signature
                    console.warn('[ACE Debug] AnySignature deserialization failed, using Ed25519Signature fallback.');
                    const sig64 = new Uint8Array(64);
                    sig64.set(rawSigBytes.slice(0, Math.min(64, rawSigBytes.length)));
                    robustSignature = new Ed25519Signature(sig64);
                }
            }
        }

        console.log(`[ACE Debug] Final signature type: ${robustSignature?.constructor?.name}`);

        // 4. Create Proof of Permission
        // We MUST use the exact fullMessage that the wallet signed.
        // If the wallet (like Petra) provides it, we use it directly.
        // Otherwise, we reconstruct manually using Aptos standard prefixes (AIP-26).
        let finalFullMessage: string = '';

        if (signOutput?.fullMessage) {
            finalFullMessage = signOutput.fullMessage;
            console.log('[ACE Debug] Using wallet-provided fullMessage (Signature Parity Guaranteed).');
        } else {
            console.log('[ACE Debug] Wallet did not provide fullMessage; reconstructing manually...');
            const msg = fullDecryptionDomain.toPrettyMessage();
            finalFullMessage = `APTOS\nmessage: ${msg}\nnonce: `;
        }

        console.log('[ACE Debug] Proof payload parameters:', {
            address: AccountAddress.fromString(account.address.toString()).toStringLong(),
            hasFullMessage: !!finalFullMessage,
            messageLength: finalFullMessage.length,
            canonicalBlobName,
            pubKeyType: robustPubKey?.constructor?.name,
            sigType: robustSignature?.constructor?.name,
        });

        const proof = ace.ProofOfPermission.createAptos({
            userAddr: AccountAddress.fromString(account.address.toString()) as any,
            publicKey: robustPubKey as any,
            signature: robustSignature as any,
            fullMessage: finalFullMessage,
        });

        // 5. PRE-FLIGHT: Verify contract check_permission returns true BEFORE calling ACE workers.
        //    This isolates domain/ownership errors from signature errors.
        try {
            const aptosClient = new Aptos(new AptosConfig({ network: Network.TESTNET }));
            const permCheck = await aptosClient.view({
                payload: {
                    function: `${MARKETPLACE_REGISTRY_ADDRESS}::marketplace::check_permission`,
                    typeArguments: [],
                    functionArguments: [
                        AccountAddress.fromString(account.address.toString()),
                        domain,
                    ],
                },
            });
            console.log('[ACE Debug] Pre-flight check_permission result:', permCheck);
            if (permCheck[0] !== true) {
                throw new Error(
                    `Contract denied access for "${canonicalBlobName}".
` +
                    `User ${account.address.toString()} has not purchased or listed this asset. ` +
                    `Please ensure the correct asset ID is being used.`
                );
            }
            console.log('[ACE Debug] Contract pre-flight PASSED. Proceeding to ACE committee...');
        } catch (preflightErr: any) {
            // Only rethrow if it's a permission denial (not a view-call infra error)
            if (
                preflightErr.message?.includes('Contract denied') ||
                preflightErr.message?.includes('has not purchased')
            ) {
                throw preflightErr;
            }
            console.warn('[ACE Debug] Pre-flight check skipped (non-critical error):', preflightErr?.message);
        }

        console.log('[ACE Debug] Proof of Permission created. Fetching key from committee...');

        // 6. Fetch Decryption Key from Committee
        const decryptionKeyResult = await ace.DecryptionKey.fetch({
            committee,
            contractId,
            domain,
            proof,
        });

        // Log the full result for diagnosis before unwrapping
        if (!decryptionKeyResult.isOk) {
            console.error('[ACE Debug] DecryptionKey.fetch FAILED.');
            console.error('[ACE Debug] Error:', decryptionKeyResult.errValue);
            console.error('[ACE Debug] Extra (worker responses):', JSON.stringify((decryptionKeyResult as any).extra));
            console.error('[ACE Debug] Proof hex (send to ACE team for debugging):',
                `publicKeyType=${robustPubKey?.constructor?.name}`,
                `signatureType=${robustSignature?.constructor?.name}`,
                `fullMsgPreview=${finalFullMessage.substring(0, 80)}`
            );
        }

        // 7. Decrypt Ciphertext
        const decipheredResult = ace.decrypt({
            decryptionKey: decryptionKeyResult.unwrapOrThrow(new Error(
                'ACE committee rejected proof. Possible causes:\n' +
                '1. Wallet public key / signature mismatch (try Petra wallet instead of Aptos Connect)\n' +
                '2. Asset was not listed via list_dataset (domain mismatch)\n' +
                '3. ACE worker unreachable (check network/CORS)\n' +
                'See console for diagnostic details.'
            )),
            ciphertext: ace.Ciphertext.fromBytes(rawBuffer).unwrapOrThrow(new Error('Corrupted or invalid encrypted blob on network')),
        });

        return decipheredResult.unwrapOrThrow(new Error('Failed to decipher text'));
    } catch (aceError: any) {
        console.error('[ACE Decryption Utility Error]', aceError);
        throw new Error(aceError.message || 'Failed to decipher dataset. Ensure you have purchased it or are the owner.');
    }
}
