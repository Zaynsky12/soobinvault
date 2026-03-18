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

const SIGN_MESSAGE = "Sign this message to unlock your SoobinVault session. This key will securely encrypt and decrypt your files locally. Your password stays in your wallet.";

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
                nonce: "soobinvault-v1" // Constant nonce for determinism
            });

            // Extract signature - response.signature can be string or object depending on wallet
            let signature: string;

            if (typeof response.signature === 'string') {
                signature = response.signature;
            } else if (response.signature && (response.signature as any).data) {
                // Handle Uint8Array signature in object
                const data = (response.signature as any).data;
                if (data instanceof Uint8Array) {
                    signature = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
                } else {
                    signature = JSON.stringify(response.signature);
                }
            } else {
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
            
            toast.success("Vault unlocked! Session key derived.", { id: toastId });
            return key;
        } catch (error) {
            console.error("Failed to unlock vault:", error);
            toast.error("Failed to unlock vault. Signature required for decryption.", { id: toastId });
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
