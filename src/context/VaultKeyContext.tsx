"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { deriveKeyFromSignature } from '../utils/crypto';
import toast from 'react-hot-toast';

interface VaultKeyContextType {
    encryptionKey: CryptoKey | null;
    keyFingerprint: string | null;
    ensureKey: (force?: boolean) => Promise<CryptoKey | null>;
    importKeyManual: (base64: string) => Promise<boolean>;
    lockVault: () => void;
    requestPin: (title: string) => Promise<string | null>;
}

const VaultKeyContext = createContext<VaultKeyContextType | undefined>(undefined);

import { VaultPinOverlay } from '@/components/VaultPinOverlay';

const SIGN_MESSAGE = "Unlock SoobinVault Session. Nonce: soobinvault-v1";

export function VaultKeyProvider({ children }: { children: ReactNode }) {
    const { signMessage, account, connected, wallet } = useWallet();
    const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
    const [keyFingerprint, setKeyFingerprint] = useState<string | null>(null);

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
                                if (pin === "__IMPORT__") {
                                    localStorage.removeItem(`soobin_vault_key_${account.address}`);
                                    localStorage.removeItem(`soobin_key_backed_up_${account.address}`);
                                    toast.success("Ready to restore your session. Please provide your Master Key.");
                                    const masterKey = await requestPin("Please carefully paste your previously backed up Master Key:");
                                    if (masterKey) await importKeyManual(masterKey);
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
                    console.error("Fingerprint update failed", e);
                }
            } else {
                setKeyFingerprint(null);
            }
        };
        updateFingerprint();
    }, [encryptionKey]);

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

        const toastId = toast.loading("Preparing vault encryption...");
        try {
            // --- SOCIAL LOGIN (APTOS CONNECT) HANDLING ---
            // Aptos Connect (Keyless) doesn't support signMessage well.
            // We proactively skip it to avoid the "Failed to sign message" error popup.
            const isSocialLogin = wallet?.name === 'Aptos Connect' || (account as any)?.wallet?.name === 'Aptos Connect';
            
            if (isSocialLogin) {
                console.log("[Vault] Social Login (Keyless) detected. Using Local Session Key to bypass signature requirement.");
                throw new Error("SOCIAL_LOGIN_BYPASS_TRIGGER");
            }

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

            // --- AUTO FALLBACK FOR KEYLESS/SOCIAL LOGIN ACCOUNTS ---
            const lowMsg = errorMsg.toLowerCase();
            const isSocialLogin = wallet?.name === 'Aptos Connect' || (account as any)?.wallet?.name === 'Aptos Connect';
            
            // Expanded fallback triggers to catch more wallet-specific signature errors
            if (errorMsg === "SOCIAL_LOGIN_BYPASS_TRIGGER" || 
                lowMsg.includes("multikey") || 
                lowMsg.includes("keyless") || 
                lowMsg.includes("failed to sign message") || 
                lowMsg.includes("signature failed") || 
                lowMsg.includes("not supported") ||
                lowMsg.includes("rejected")) {
                
                console.warn("[Vault] Standard signature not available. Using secure local session key.");
                
                // PREVENT DESTRUCTIVE OVERWRITES
                if (!force && encryptionKey) {
                    toast.success("Using existing local session key.", { id: toastId });
                    return encryptionKey;
                }
                
                const savedData = localStorage.getItem(`soobin_vault_key_${account.address}`);
                
                // --- CUSTOM TOAST MESSAGE BASED ON WALLET TYPE ---
                if (isSocialLogin) {
                    toast("🔒 Social Login: Initializing secure local session key...", { 
                        id: toastId, icon: '🛡️', duration: 4000 
                    });
                } else if (force) {
                    toast("Initializing a discrete local session key for this vault...", { 
                        id: toastId, icon: '🔑', duration: 4000 
                    });
                } else {
                    toast("Master Key Signature skipped. Using Secure Local Session.", { 
                        id: toastId, icon: '🔒', duration: 4000 
                    });
                }
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
                                    if (pin === "__IMPORT__") {
                                        localStorage.removeItem(`soobin_vault_key_${account.address}`);
                                        localStorage.removeItem(`soobin_key_backed_up_${account.address}`);
                                        toast.success("Ready to restore your session. Please provide your Master Key.");
                                        const masterKey = await requestPin("Please carefully paste your previously backed up Master Key:");
                                        if (masterKey) await importKeyManual(masterKey);
                                        return null;
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

                // ---------------------------------------------------
                // NEW VAULT CASE (No saved data found for fallback)
                // ---------------------------------------------------
                
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
        <VaultKeyContext.Provider value={{ encryptionKey, keyFingerprint, ensureKey, importKeyManual, lockVault, requestPin }}>
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
