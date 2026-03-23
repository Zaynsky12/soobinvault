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
    requestPin: (title: string) => Promise<string | null>;
}

const VaultKeyContext = createContext<VaultKeyContextType | undefined>(undefined);

import { VaultPinOverlay } from '@/components/VaultPinOverlay';

const SIGN_MESSAGE = "Unlock SoobinVault Session. Nonce: soobinvault-v1";

export function VaultKeyProvider({ children }: { children: ReactNode }) {
    const { signMessage, account, connected } = useWallet();
    const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);

    const [pinPromptConfig, setPinPromptConfig] = useState<{
        isOpen: boolean;
        title: string;
        allowReset?: boolean;
        required?: boolean;
        timestamp?: number;
        resolve: ((pin: string | null) => void) | null;
    }>({ isOpen: false, title: "", allowReset: false, required: false, timestamp: 0, resolve: null });

    const requestPin = (title: string, allowReset: boolean = false, required: boolean = false): Promise<string | null> => {
        return new Promise((resolve) => {
            setPinPromptConfig({ isOpen: true, title, allowReset, required, timestamp: Date.now(), resolve });
        });
    };

    // Load key from localStorage on mount or account change
    React.useEffect(() => {
        const loadPersistedKey = async () => {
            if (!account || typeof window === 'undefined') return;
            const savedData = localStorage.getItem(`soobin_vault_key_${account.address}`);
            if (savedData) {
                try {
                    let base64MasterKey = savedData;
                    
                    // Check if it's a JSON string (meaning it's PIN-encrypted)
                    if (savedData.startsWith("{")) {
                        const encryptedObject = JSON.parse(savedData);
                        if (encryptedObject.protected) {
                            let decrypted = false;
                            let promptTitle = "🔒 Vault is locked. Enter your local PIN to decrypt your session key:";
                            while (!decrypted) {
                                const pin = await requestPin(promptTitle, true);
                                if (!pin) {
                                    toast.error("PIN required to restore session.");
                                    return;
                                }
                                if (pin === "__RESET__") {
                                    localStorage.removeItem(`soobin_vault_key_${account.address}`);
                                    localStorage.removeItem(`soobin_key_backed_up_${account.address}`);
                                    toast.success("Local vault cleared. You can now generate a new one.");
                                    return;
                                }
                                
                                try {
                                    const ptUtf8 = new TextEncoder().encode(pin);
                                    const hashBuffer = await window.crypto.subtle.digest('SHA-256', ptUtf8);
                                    const kek = await window.crypto.subtle.importKey(
                                        'raw', hashBuffer, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
                                    );
                                    
                                    const iv = new Uint8Array(atob(encryptedObject.iv).split("").map(c => c.charCodeAt(0)));
                                    const ciphertext = new Uint8Array(atob(encryptedObject.ciphertext).split("").map(c => c.charCodeAt(0)));
                                    
                                    const decryptedBuffer = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kek, ciphertext);
                                    base64MasterKey = new TextDecoder().decode(decryptedBuffer);
                                    decrypted = true;
                                } catch (decErr) {
                                    toast.error("Incorrect PIN. Please try again.");
                                    promptTitle = "❌ Incorrect password. Please try again:";
                                }
                            }
                        }
                    }

                    const bytes = new Uint8Array(
                        atob(base64MasterKey).split("").map(c => c.charCodeAt(0))
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
                    
                    toast("Welcome back! Session restored securely.", { icon: '🛡️', duration: 5000 });
                } catch (e) {
                    console.error("Failed to restore persisted key", e);
                }
            }
        };
        loadPersistedKey();
    }, [account]);

    const lockVault = () => {
        setEncryptionKey(null);
        // We do not delete from localStorage because it is now PIN-protected (if keyless)
        toast.success("Vault session securely locked.");
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
            
            // Persist the key with a mandatory PIN
            let pin = null;
            console.log("[Vault] Entering mandatory PIN creation loop...");
            // Increased delay to ensure any previous signature UI and navbar animation has cleared
            await new Promise(r => setTimeout(r, 500));

            while (!pin) {
                console.log("[Vault] Requesting PIN...");
                pin = await requestPin("🔒 Create a PIN to securely protect your session on this device:", false, true);
                if (!pin) {
                    console.warn("[Vault] PIN creation cancelled or empty. Retrying...");
                    toast.error("PIN is mandatory to secure your vault.");
                }
            }
            console.log("[Vault] PIN received, encrypting key...");
            
            const rawKey = await window.crypto.subtle.exportKey('raw', key);
            const base64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
            
            const ptUtf8 = new TextEncoder().encode(pin);
            const hashBuffer = await window.crypto.subtle.digest('SHA-256', ptUtf8);
            const kek = await window.crypto.subtle.importKey(
                'raw', hashBuffer, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
            );
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encodedBase64 = new TextEncoder().encode(base64);
            const ciphertextBuf = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, encodedBase64);
            
            const encryptedData = JSON.stringify({
                protected: true,
                iv: btoa(String.fromCharCode(...iv)),
                ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertextBuf)))
            });
            localStorage.setItem(`soobin_vault_key_${account.address}`, encryptedData);
            
            // ONLY SET ENCRYPTION KEY AFTER PIN IS CREATED AND DATA IS PERSISTED
            setEncryptionKey(key);
            
            const keyHash = await window.crypto.subtle.digest('SHA-256', rawKey);
            const fingerprint = Array.from(new Uint8Array(keyHash)).slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log(`[Vault] Session key derived and secured. Fingerprint: ${fingerprint}`);
            
            toast.success(`${force ? 'Vault created/restored!' : 'Vault unlocked!'} (Key: ${fingerprint})`, { id: toastId });
            
            setTimeout(() => {
                const isBackedUp = localStorage.getItem(`soobin_key_backed_up_${account.address}`);
                console.log(`[Vault] Checking backup status for ${account.address}: ${isBackedUp}`);
                if (!isBackedUp || isBackedUp === 'false') {
                    console.log("[Vault] Dispatching vault:requireBackup event");
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
                // Only return early if WE ARE NOT forcing a new key and we already have one!
                if (!force && encryptionKey) {
                    toast.success("Using existing local session key.", { id: toastId });
                    return encryptionKey;
                }
                
                const savedData = localStorage.getItem(`soobin_vault_key_${account.address}`);
                if (savedData) {
                    try {
                        let base64MasterKey = savedData;
                        
                        // Check if it's a JSON string (meaning it's PIN-encrypted)
                        if (savedData.startsWith("{")) {
                            const encryptedObject = JSON.parse(savedData);
                            if (encryptedObject.protected) {
                                let decrypted = false;
                                let promptTitle = "🔒 Vault is localized. Enter your local PIN to decrypt your session key:";
                                while (!decrypted) {
                                    const pin = await requestPin(promptTitle, true);
                                    if (!pin) {
                                        toast.error("PIN required to restore session.");
                                        return null;
                                    }
                                    if (pin === "__RESET__") {
                                        localStorage.removeItem(`soobin_vault_key_${account.address}`);
                                        localStorage.removeItem(`soobin_key_backed_up_${account.address}`);
                                        toast.success("Local vault cleared. Proceeding to create a new one.");
                                        throw new Error("Reset local vault");
                                    }
                                    
                                    try {
                                        const ptUtf8 = new TextEncoder().encode(pin);
                                        const hashBuffer = await window.crypto.subtle.digest('SHA-256', ptUtf8);
                                        const kek = await window.crypto.subtle.importKey(
                                            'raw', hashBuffer, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
                                        );
                                        
                                        const iv = new Uint8Array(atob(encryptedObject.iv).split("").map(c => c.charCodeAt(0)));
                                        const ciphertext = new Uint8Array(atob(encryptedObject.ciphertext).split("").map(c => c.charCodeAt(0)));
                                        
                                        const decryptedBuffer = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kek, ciphertext);
                                        base64MasterKey = new TextDecoder().decode(decryptedBuffer);
                                        decrypted = true;
                                    } catch (decErr) {
                                        toast.error("Incorrect PIN. Please try again.");
                                        promptTitle = "❌ Incorrect password. Please try again:";
                                    }
                                }
                            }
                        }

                        const bytes = new Uint8Array(atob(base64MasterKey).split("").map(c => c.charCodeAt(0)));
                        const key = await window.crypto.subtle.importKey(
                            'raw', bytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
                        );
                        setEncryptionKey(key);
                        toast.success("Restored existing local session key.", { id: toastId });
                        return key;
                    } catch (e) {
                        console.warn("Failed to restore key during fallback, proceeding to generate a new one.", e);
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
                    
                    const rawKey = await window.crypto.subtle.exportKey('raw', key);
                    const base64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
                    
                    let pin = null;
                    console.log("[Vault] [Fallback] Entering mandatory PIN creation loop...");
                    await new Promise(r => setTimeout(r, 500));
                    
                    while (!pin) {
                        console.log("[Vault] [Fallback] Requesting PIN...");
                        pin = await requestPin("🔒 Create a PIN to securely encrypt your local session key:", false, true);
                        if (!pin) {
                            console.warn("[Vault] [Fallback] PIN creation cancelled. Retrying...");
                            toast.error("PIN is mandatory to secure your vault.");
                        }
                    }
                    console.log("[Vault] [Fallback] PIN received, encrypting key...");
                    
                    const ptUtf8 = new TextEncoder().encode(pin);
                    const hashBuffer = await window.crypto.subtle.digest('SHA-256', ptUtf8);
                    const kek = await window.crypto.subtle.importKey(
                        'raw', hashBuffer, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
                    );
                    const iv = window.crypto.getRandomValues(new Uint8Array(12));
                    const encodedBase64 = new TextEncoder().encode(base64);
                    const ciphertextBuf = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, encodedBase64);
                    
                    const encryptedData = JSON.stringify({
                        protected: true,
                        iv: btoa(String.fromCharCode(...iv)),
                        ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertextBuf)))
                    });
                    localStorage.setItem(`soobin_vault_key_${account.address}`, encryptedData);
                    
                    // ONLY SET ENCRYPTION KEY AFTER PIN IS CREATED AND DATA IS PERSISTED
                    setEncryptionKey(key);
                    
                    toast.success("Key created and protected with PIN.");
                    
                    const keyHash = await window.crypto.subtle.digest('SHA-256', rawKey);
                    const fingerprint = Array.from(new Uint8Array(keyHash)).slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('');
                    console.log(`[Vault] Random session key generated. Fingerprint: ${fingerprint}`);
                    
                    // Force a backup warning immediately so the user knows they MUST back it up!
                    setTimeout(() => {
                        console.log("[Vault] [Fallback] Dispatching vault:requireBackup event");
                        window.dispatchEvent(new CustomEvent('vault:requireBackup'));
                    }, 1000);
                    
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
            
            // Persist for future sessions on this device
            let pin = null;
            console.log("[Vault] [Import] Entering mandatory PIN creation loop...");
            await new Promise(r => setTimeout(r, 500));
            
            while (!pin) {
                console.log("[Vault] [Import] Requesting PIN...");
                pin = await requestPin("🔒 Create a PIN to securely encrypt the imported key on this device:", false, true);
                if (!pin) {
                    console.warn("[Vault] [Import] PIN creation cancelled. Retrying...");
                    toast.error("PIN is mandatory to secure your vault.");
                }
            }
            console.log("[Vault] [Import] PIN received, encrypting key...");
            
            const ptUtf8 = new TextEncoder().encode(pin);
            const hashBuffer = await window.crypto.subtle.digest('SHA-256', ptUtf8);
            const kek = await window.crypto.subtle.importKey(
                'raw', hashBuffer, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
            );
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encodedBase64 = new TextEncoder().encode(base64);
            const ciphertextBuf = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, encodedBase64);
            
            const encryptedData = JSON.stringify({
                protected: true,
                iv: btoa(String.fromCharCode(...iv)),
                ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertextBuf)))
            });
            localStorage.setItem(`soobin_vault_key_${account?.address}`, encryptedData);
            
            // ONLY SET ENCRYPTION KEY AFTER PIN IS CREATED AND DATA IS PERSISTED
            setEncryptionKey(key);
            
            toast.success("Master Key restored and secured with PIN.");
            
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
        <VaultKeyContext.Provider value={{ encryptionKey, ensureKey, importKeyManual, lockVault, requestPin }}>
            {children}
            <VaultPinOverlay 
                key={pinPromptConfig.timestamp || "pin-overlay"}
                isOpen={pinPromptConfig.isOpen}
                title={pinPromptConfig.title}
                allowReset={pinPromptConfig.allowReset}
                required={pinPromptConfig.required}
                onSubmit={(pin) => {
                    pinPromptConfig.resolve?.(pin);
                    setPinPromptConfig({ isOpen: false, title: "", allowReset: false, required: false, timestamp: 0, resolve: null });
                }}
                onCancel={() => {
                    pinPromptConfig.resolve?.(null);
                    setPinPromptConfig({ isOpen: false, title: "", allowReset: false, required: false, timestamp: 0, resolve: null });
                }}
            />
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
