"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { deriveKeyFromSignature } from '../utils/crypto';
import toast from 'react-hot-toast';

interface VaultKeyContextType {
    encryptionKey: CryptoKey | null;
    keyFingerprint: string | null;
    ensureKey: (force?: boolean) => Promise<CryptoKey | null>;
    lockVault: () => void;
}

const VaultKeyContext = createContext<VaultKeyContextType | undefined>(undefined);

const SIGN_MESSAGE = "Unlock SoobinVault Session. Nonce: soobinvault-v1";

export function VaultKeyProvider({ children }: { children: ReactNode }) {
    const { signMessage, account, connected, wallet } = useWallet();
    const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
    const [keyFingerprint, setKeyFingerprint] = useState<string | null>(null);
    const hasPromptedRef = React.useRef(false);

    // Reset prompt tracking if wallet disconnects
    React.useEffect(() => {
        if (!connected || !account) {
            hasPromptedRef.current = false;
        }
    }, [connected, account]);

    // Auto-prompt signature once per React lifecycle (resets on page refresh)
    React.useEffect(() => {
        if (connected && account && !encryptionKey) {
            if (!hasPromptedRef.current) {
                hasPromptedRef.current = true;
                console.log("[Vault] Auto-prompting vault unlock (waiting for adapter sync)...");
                // Add a slight delay to prevent WalletNotConnectedError race condition
                const timer = setTimeout(() => {
                    ensureKey();
                }, 800);
                return () => clearTimeout(timer);
            }
        }
    }, [connected, account, encryptionKey]);

    // Reactive lock: Immediately clear encryptionKey if wallet is disconnected or account is lost
    React.useEffect(() => {
        if (!connected || !account) {
            if (encryptionKey) {
                console.log("[Vault] Wallet disconnected or account missing. Locking session automatically.");
                setEncryptionKey(null);
            }
        }
    }, [connected, account, encryptionKey]);
    
    // Manage Fingerprint
    React.useEffect(() => {
        const updateFingerprint = async () => {
            if (encryptionKey) {
                try {
                    const rawKey = await window.crypto.subtle.exportKey('raw', encryptionKey);
                    const keyHash = await window.crypto.subtle.digest('SHA-256', rawKey);
                    const fingerprint = Array.from(new Uint8Array(keyHash)).slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('');
                    setKeyFingerprint(fingerprint);
                } catch (e) {
                    console.warn("Fingerprint update failed", e);
                }
            } else {
                setKeyFingerprint(null);
            }
        };
        updateFingerprint();
    }, [encryptionKey]);

    const lockVault = () => {
        setEncryptionKey(null);
        hasPromptedRef.current = false;
        toast.success("Vault session securely locked.");
    };

    const ensureKey = async (force: boolean = false): Promise<CryptoKey | null> => {
        if (encryptionKey && !force) return encryptionKey;

        if (!connected || !account) {
            toast.error("Please connect your wallet first");
            return null;
        }

        const toastId = toast.loading("Authenticating Secure Session...");
        try {


            // Request signature for deterministic key derivation
            let response;
            try {
                // Simplified payload for maximum compatibility (prevents "Not Supported" in Petra)
                response = await signMessage({
                    message: SIGN_MESSAGE,
                    nonce: "soobinvault-v1"
                } as any);
            } catch (initialError: any) {
                console.warn("[Vault] signMessage failed, trying basic string payload...", initialError);
                // Last ditch effort for very legacy wallets
                response = await signMessage(SIGN_MESSAGE as any);
            }

            // Extract signature - response.signature can be string or object depending on wallet
            let signature: string;

            if (typeof response.signature === 'string') {
                signature = response.signature;
            } else if (response.signature instanceof Uint8Array) {
                signature = Array.from(response.signature).map((b: number) => b.toString(16).padStart(2, '0')).join('');
            } else if (response.signature && (response.signature as any).data) {
                const data = (response.signature as any).data;
                if (data instanceof Uint8Array || Array.isArray(data)) {
                    signature = Array.from(data).map((b: number) => b.toString(16).padStart(2, '0')).join('');
                } else {
                    signature = JSON.stringify(response.signature);
                }
            } else {
                signature = String(response.signature || "");
            }

            if (!signature || signature === "[object Object]") {
                 throw new Error("Signature extraction failed. Unsupported wallet signature format.");
            }

            // Canonicalize signature
            const canonicalSignature = signature.toLowerCase().startsWith('0x') 
                ? signature.toLowerCase().slice(2) 
                : signature.toLowerCase();

            // Canonicalize salt
            const rawAddress = account.address.toString().toLowerCase();
            const addressWithout0x = rawAddress.startsWith('0x') ? rawAddress.slice(2) : rawAddress;
            const canonicalSalt = addressWithout0x.padStart(64, '0');
            
            const key = await deriveKeyFromSignature(canonicalSignature, canonicalSalt);
            
            // Fully deterministic, set in memory immediately
            setEncryptionKey(key);
            
            const rawKey = await window.crypto.subtle.exportKey('raw', key);
            const keyHash = await window.crypto.subtle.digest('SHA-256', rawKey);
            const fingerprint = Array.from(new Uint8Array(keyHash)).slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log(`[Vault] Session key derived deterministically. Fingerprint: ${fingerprint}`);
            
            toast.success('Vault unlocked successfully!', { id: toastId });
            
            return key;
        } catch (error: any) {
            console.warn("Failed to unlock vault (caught gracefully):", error);
            
            let errorMsg = "Signature missing. Please check your wallet popup.";
            
            if (error?.name === 'UserRejectedRequestError' || (typeof error?.message === 'string' && error.message.toLowerCase().includes('user rejected'))) {
                errorMsg = "Request canceled by user.";
            } else if (error?.message) {
                errorMsg = error.message;
            }

            if (errorMsg === "Request canceled by user.") {
                toast.error("Unlock canceled. Vault remains locked.", { id: toastId });
            } else {
                toast.error(`Unlock failed: ${errorMsg}`, { id: toastId });
            }
            return null;
        }
    };
    return (
        <VaultKeyContext.Provider value={{ encryptionKey, keyFingerprint, ensureKey, lockVault }}>
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
