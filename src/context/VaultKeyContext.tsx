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
            const signature = typeof response.signature === 'string' 
                ? response.signature 
                : (response.signature as any).toString();

            if (!signature) throw new Error("Signature failed");

            // Derive 32-byte key from signature
            const key = await deriveKeyFromSignature(signature);
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
