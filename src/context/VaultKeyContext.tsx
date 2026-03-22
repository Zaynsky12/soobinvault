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
        // Do NOT delete from localStorage, otherwise Keyless/Multikey accounts 
        // will permanently lose their randomly generated keys upon disconnecting!
        toast.success("Vault session locked in memory.");
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
            let response;
            try {
                response = await signMessage({
                    message: SIGN_MESSAGE,
                    nonce: "soobinvault-v1",
                    address: true,      // Include address
                    application: false  // DO NOT include domain
                } as any);
            } catch (initialError: any) {
                console.warn("[Vault] Standard signMessage failed, trying fallback...", initialError);
                // Fallback for strict wallets that reject customized payloads
                response = await signMessage({
                    message: SIGN_MESSAGE,
                    nonce: "soobinvault-v1",
                });
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
            setEncryptionKey(key);
            
            // Persist the key
            const rawKey = await window.crypto.subtle.exportKey('raw', key);
            const base64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
            localStorage.setItem(`soobin_vault_key_${account.address}`, base64);
            
            const keyHash = await window.crypto.subtle.digest('SHA-256', rawKey);
            const fingerprint = Array.from(new Uint8Array(keyHash)).slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log(`[Vault] Session key derived. Fingerprint: ${fingerprint}`);
            
            toast.success(`Vault unlocked! (Key: ${fingerprint})`, { id: toastId });
            
            setTimeout(() => {
                const isBackedUp = localStorage.getItem(`soobin_key_backed_up_${account.address}`);
                if (!isBackedUp) {
                    window.dispatchEvent(new CustomEvent('vault:requireBackup'));
                } else {
                    toast("Security Priority: Backup your Master Key in Settings for session recovery.", { 
                        icon: '🔑', 
                        duration: 6000 
                    });
                }
            }, 1000);
            
            return key;
        } catch (error: any) {
            console.error("Failed to unlock vault (Full Error):", error);
            console.debug("Error type is:", typeof error);
            
            let errorMsg = "Signature missing. Please check your wallet popup.";
            
            if (error === undefined) {
                errorMsg = "Browser wallet extension rejected the request (Undefined Error).";
            } else if (error === null) {
                errorMsg = "Browser wallet extension rejected the request (Null Error).";
            } else if (typeof error === 'string') {
                errorMsg = error;
            } else if (error?.name === 'UserRejectedRequestError' || (typeof error?.message === 'string' && error.message.toLowerCase().includes('user rejected'))) {
                errorMsg = "Request canceled by user.";
            } else if (error?.message) {
                errorMsg = error.message;
            } else if (error && typeof error === 'object') {
                try {
                    errorMsg = JSON.stringify(error);
                } catch {
                    errorMsg = String(error);
                }
            }

            // --- AUTO FALLBACK FOR KEYLESS/MULTIKEY ACCOUNTS ---
            if (errorMsg.toLowerCase().includes("multikey") || errorMsg.toLowerCase().includes("keyless")) {
                console.warn("[Vault] Multikey signature extraction failed. Using secure random fallback.");
                
                // PREVENT DESTRUCTIVE OVERWRITES
                // If the user already has a session key in memory, or in localStorage, we should use it!
                if (force && encryptionKey) {
                    toast.success("Vault is securely unlocked using your local key.", { id: toastId });
                    return encryptionKey;
                }
                
                const savedKey = localStorage.getItem(`soobin_vault_key_${account.address}`);
                if (savedKey) {
                    try {
                        const bytes = new Uint8Array(atob(savedKey).split("").map(c => c.charCodeAt(0)));
                        const key = await window.crypto.subtle.importKey(
                            'raw', bytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
                        );
                        setEncryptionKey(key);
                        toast.success("Restored existing local session key.", { id: toastId });
                        return key;
                    } catch (e) {
                        console.warn("Failed to restore key during fallback, proceeding to generate a new one.");
                    }
                }

                toast("Keyless/Multikey account detected. Generating a secure local session key...", { 
                    id: toastId, 
                    icon: '🚀',
                    duration: 4000 
                });
                
                try {
                    const key = await window.crypto.subtle.generateKey(
                        { name: 'AES-GCM', length: 256 },
                        true,
                        ['encrypt', 'decrypt']
                    );
                    
                    setEncryptionKey(key);
                    
                    const rawKey = await window.crypto.subtle.exportKey('raw', key);
                    const base64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
                    localStorage.setItem(`soobin_vault_key_${account.address}`, base64);
                    
                    const keyHash = await window.crypto.subtle.digest('SHA-256', rawKey);
                    const fingerprint = Array.from(new Uint8Array(keyHash)).slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('');
                    console.log(`[Vault] Random session key generated. Fingerprint: ${fingerprint}`);
                    
                    // Force a backup warning immediately so the user knows they MUST back it up!
                    setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('vault:requireBackup'));
                    }, 500);
                    
                    return key;
                } catch (fallbackError) {
                    console.error("Fallback key generation failed:", fallbackError);
                    toast.error("Failed to generate local key.", { id: toastId });
                    return null;
                }
            }
            // ---------------------------------------------------

            if (errorMsg === "Request canceled by user.") {
                toast.error("Unlock canceled. Vault remains locked.", { id: toastId });
            } else {
                toast.error(`Unlock failed: ${errorMsg}`, { id: toastId });
            }
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
            localStorage.setItem(`soobin_key_backed_up_${account?.address}`, 'true'); // Implicit backup when imported
            
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
