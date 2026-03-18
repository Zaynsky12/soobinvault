"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { deriveKeyFromSignature } from '../utils/crypto';
import toast from 'react-hot-toast';

interface VaultKeyContextType {
    encryptionKey: CryptoKey | null;
    ensureKey: () => Promise<CryptoKey | null>;
    lockVault: () => void;
}

const VaultKeyContext = createContext<VaultKeyContextType | undefined>(undefined);

const SIGN_MESSAGE = "Unlock SoobinVault Session. Nonce: soobinvault-v1";

export function VaultKeyProvider({ children }: { children: ReactNode }) {
    const { signMessage, account, connected } = useWallet();
    const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);

    const lockVault = () => {
        setEncryptionKey(null);
        toast.success("Vault locked. Memory cleared.");
    };

    const ensureKey = async (): Promise<CryptoKey | null> => {
        if (encryptionKey) return encryptionKey;

        if (!connected || !account) {
            toast.error("Please connect your wallet first");
            return null;
        }

        const toastId = toast.loading("Waiting for wallet signature to derive session key...");
        try {
            // Request signature for deterministic key derivation
            const response = await signMessage({
                message: SIGN_MESSAGE,
                nonce: "soobinvault-v1"
            });

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
            const salt = account.address.toString().toLowerCase();
            const key = await deriveKeyFromSignature(canonicalSignature, salt);
            setEncryptionKey(key);
            
            // Log key fingerprint (sharing first 4 chars of hash is safe for debugging)
            const keyBuffer = await window.crypto.subtle.exportKey('raw', key);
            const keyHash = await window.crypto.subtle.digest('SHA-256', keyBuffer);
            const fingerprint = Array.from(new Uint8Array(keyHash)).slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log(`[Vault] Session key derived. Fingerprint: ${fingerprint}`);
            
            toast.success(`Vault unlocked! (Key: ${fingerprint})`, { id: toastId });
            return key;
        } catch (error: any) {
            console.error("Failed to unlock vault (Full Error):", error);
            const errorMsg = error?.message || "Signature required for decryption.";
            toast.error(`Unlock failed: ${errorMsg}`, { id: toastId });
            return null;
        }
    };

    return (
        <VaultKeyContext.Provider value={{ encryptionKey, ensureKey, lockVault }}>
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
