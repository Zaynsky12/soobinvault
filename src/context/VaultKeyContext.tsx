"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { deriveKeyFromSignature } from '../utils/crypto';
import toast from 'react-hot-toast';

interface VaultKeyContextType {
    encryptionKey: CryptoKey | null;
    ensureKey: (force?: boolean) => Promise<CryptoKey | null>;
    importKeyManual: (base64: string) => Promise<boolean>;
    lockVault: () => void;
}

const VaultKeyContext = createContext<VaultKeyContextType | undefined>(undefined);

const SIGN_MESSAGE = "Unlock SoobinVault Session. Nonce: soobinvault-v1";

export function VaultKeyProvider({ children }: { children: ReactNode }) {
    const { signMessage, account, connected } = useWallet();
    const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);

    // Load key from localStorage on mount or account change
    React.useEffect(() => {
        const loadPersistedKey = async () => {
            if (!account || typeof window === 'undefined') return;
            const savedKey = localStorage.getItem(`soobin_vault_key_${account.address}`);
            if (savedKey) {
                try {
                    const bytes = new Uint8Array(
                        atob(savedKey).split("").map(c => c.charCodeAt(0))
                    );
                    const key = await window.crypto.subtle.importKey(
                        'raw',
                        bytes,
                        { name: 'AES-GCM', length: 256 },
                        true,
                        ['encrypt', 'decrypt']
                    );
                    setEncryptionKey(key);
                    console.log("[Vault] Key restored from local persistence.");
                    
                    // Remind user to backup key if they haven't been reminded this session
                    toast("Welcome back! Remember to backup your Master Key in Settings.", { icon: '🛡️', duration: 5000 });
                } catch (e) {
                    console.error("Failed to restore persisted key");
                }
            }
        };
        loadPersistedKey();
    }, [account]);

    const lockVault = () => {
        setEncryptionKey(null);
        if (account) localStorage.removeItem(`soobin_vault_key_${account.address}`);
        toast.success("Vault locked and persistence cleared.");
    };

    const ensureKey = async (force: boolean = false): Promise<CryptoKey | null> => {
        if (encryptionKey && !force) return encryptionKey;

        if (!connected || !account) {
            toast.error("Please connect your wallet first");
            return null;
        }

        const toastId = toast.loading("Waiting for wallet signature to derive session key...");
        try {
            // Request signature for deterministic key derivation
            const response = await signMessage({
                message: SIGN_MESSAGE,
                nonce: "soobinvault-v1",
                address: true,      // Include address
                application: false  // DO NOT include domain (important for cross-domain/device consistency)
            } as any); // Use 'as any' to avoid potential linting issues with optional fields

            // Extract signature - response.signature can be string or object depending on wallet
            let signature: string;

            if (typeof response.signature === 'string') {
                signature = response.signature;
            } else if (response.signature instanceof Uint8Array) {
                // If it's a direct Uint8Array
                signature = Array.from(response.signature).map(b => b.toString(16).padStart(2, '0')).join('');
            } else if (response.signature && (response.signature as any).data) {
                // Handle Uint8Array signature inside an object with .data field
                const data = (response.signature as any).data;
                if (data instanceof Uint8Array || Array.isArray(data)) {
                    signature = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
                } else {
                    signature = JSON.stringify(response.signature);
                }
            } else {
                // Fallback for any other type
                signature = String(response.signature || "");
            }

            if (!signature || signature === "[object Object]") {
                 throw new Error("Signature extraction failed. Unsupported wallet signature format.");
            }

            // Normalisasi signature agar identik di semua browser/perangkat
            // Menghapus '0x' jika ada dan mengubah ke lowercase untuk konsistensi deterministik
            const canonicalSignature = signature.toLowerCase().startsWith('0x') 
                ? signature.toLowerCase().slice(2) 
                : signature.toLowerCase();

            // Derive 32-byte key from canonical signature + account address as salt
            // Normalisasi Alamat: Ambil string tanpa 0x, lalu pad ke 64 karakter (32 bytes)
            const rawAddress = account.address.toString().toLowerCase();
            const addressWithout0x = rawAddress.startsWith('0x') ? rawAddress.slice(2) : rawAddress;
            const canonicalSalt = addressWithout0x.padStart(64, '0');
            
            const key = await deriveKeyFromSignature(canonicalSignature, canonicalSalt);
            setEncryptionKey(key);
            
            // Persist the key for automatic unlock next time
            const rawKey = await window.crypto.subtle.exportKey('raw', key);
            const base64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
            localStorage.setItem(`soobin_vault_key_${account.address}`, base64);
            
            // Log key fingerprint (sharing first 4 chars of hash is safe for debugging)
            const keyHash = await window.crypto.subtle.digest('SHA-256', rawKey);
            const fingerprint = Array.from(new Uint8Array(keyHash)).slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log(`[Vault] Session key derived. Fingerprint: ${fingerprint}`);
            
            toast.success(`Vault unlocked! (Key: ${fingerprint})`, { id: toastId });
            
            // Add a slight delay for the backup reminder so it doesn't overlap too much
            setTimeout(() => {
                toast("Security Priority: Backup your Master Key in Settings for session recovery.", { 
                    icon: '🔑', 
                    duration: 6000 
                });
            }, 1000);
            
            return key;
        } catch (error: any) {
            console.error("Failed to unlock vault (Full Error):", error);
            const errorMsg = error?.message || "Signature required for decryption.";
            toast.error(`Unlock failed: ${errorMsg}`, { id: toastId });
            return null;
        }
    };
    const importKeyManual = async (base64: string): Promise<boolean> => {
        try {
            const bytes = new Uint8Array(
                atob(base64).split("").map(c => c.charCodeAt(0))
            );
            
            const key = await window.crypto.subtle.importKey(
                'raw',
                bytes,
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );
            
            setEncryptionKey(key);
            
            // Persist for future sessions on this device
            localStorage.setItem(`soobin_vault_key_${account?.address}`, base64);
            
            // Log fingerprint for consistency check
            const keyHash = await window.crypto.subtle.digest('SHA-256', bytes);
            const fingerprint = Array.from(new Uint8Array(keyHash)).slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('');
            toast.success(`Vault unlocked via Master Key! (Key: ${fingerprint})`);
            return true;
        } catch (e) {
            toast.error("Invalid Master Key format.");
            return false;
        }
    };

    return (
        <VaultKeyContext.Provider value={{ encryptionKey, ensureKey, importKeyManual, lockVault }}>
            {children}
        </VaultKeyContext.Provider>
    );
}

export function useVaultKey() {
    const context = useContext(VaultKeyContext);
    if (context === undefined) {
        throw new Error('useVaultKey must be used within a VaultKeyProvider');
    }
    return context;
}
