"use client";

import { useRouter } from 'next/navigation';
import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, File as FileIcon, CheckCircle, Link as LinkIcon, Lock, Unlock, AlertCircle, Music, FileText, FileSpreadsheet, Presentation, Archive, Shield, ShieldCheck, ChevronRight, ShieldOff, Calendar, Clock, Coins, Check, Folder, ArrowDown, Banknote, Tag, AlignLeft, BrainCircuit, Globe, Copy } from 'lucide-react';
import { encryptFile, encryptText } from '../utils/crypto';
import { useVaultKey } from '../context/VaultKeyContext';
import { MARKETPLACE_REGISTRY_ADDRESS, SHELBYUSD_FA_METADATA_ADDRESS } from '../lib/constants';
import gsap from 'gsap';
import toast from 'react-hot-toast';
import { GlassCard } from './ui/GlassCard';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useUploadBlobs } from "@shelby-protocol/react";
import { getFileType } from '../utils/file';
import { Network, AccountAddress } from "@aptos-labs/ts-sdk";
import { ace } from "@aptos-labs/ace-sdk";

// Shelby SDK Patch: Intercept fetch responses to prevent internal 'already received' errors,
// implement network-level concurrency control, and add automatic retries for transient 500 errors.
if (typeof window !== "undefined") {
    if (!(window as any)._shelbyPatched) {
        const originalFetch = window.fetch;
        (window as any)._shelbyActiveUploads = 0;

        window.fetch = async function (...args) {
            // Safely parse URL
            let urlStr = '';
            if (typeof args[0] === 'string') { urlStr = args[0]; }
            else if (args[0] && (args[0] as Request).url) { urlStr = (args[0] as Request).url; }
            else if (args[0] && (args[0] as URL).href) { urlStr = (args[0] as URL).href; }

            const isPartUpload = urlStr.includes('/parts/') && (args[1] as any)?.method === 'PUT';
            const isCompleteRequest = urlStr.includes('/complete') && (args[1] as any)?.method === 'POST';

            // Custom HTTP connection pooling for chunks (1 max concurrent)
            if (isPartUpload) {
                await new Promise<void>(resolve => {
                    const tryAcquire = () => {
                        if ((window as any)._shelbyActiveUploads < 1) {
                            (window as any)._shelbyActiveUploads++;
                            resolve();
                        } else {
                            setTimeout(tryAcquire, 150 + Math.random() * 200);
                        }
                    };
                    tryAcquire();
                });
            }

            // Retry logic with exponential backoff
            const maxRetries = 3;
            let attempt = 0;

            const executeFetch = async (): Promise<Response> => {
                try {
                    // Small delay before completion to allow nodes to sync
                    if (isCompleteRequest && attempt === 0) {
                        await new Promise(r => setTimeout(r, 2000));
                    }

                    const response = await originalFetch.apply(this, args);

                    // Handle success or non-retryable errors
                    if (response.ok) return response;

                    // Specific Shelby 400 'already received' fix
                    if (response.status === 400 && urlStr.includes('/parts/')) {
                        const clone = response.clone();
                        try {
                            const body = await clone.json();
                            if (body?.error?.includes('has already recieved partIdx=')) {
                                console.warn("[Shelby Patch] Caught false-negative 400. Reporting as 200 OK.");
                                return new Response(JSON.stringify({ success: true, patched: true }), {
                                    status: 200, statusText: "OK", headers: response.headers
                                });
                            }
                        } catch (e) {}
                    }

                    // Retry on transient server errors (500, 502, 503, 504)
                    if ([500, 502, 503, 504].includes(response.status) && attempt < maxRetries) {
                        attempt++;
                        const delay = Math.pow(2, attempt) * 1000 + (Math.random() * 500);
                        console.warn(`[Shelby Patch] Server Error ${response.status}. Retrying in ${Math.round(delay)}ms... (Attempt ${attempt}/${maxRetries})`);
                        await new Promise(r => setTimeout(r, delay));
                        return executeFetch();
                    }

                    return response;
                } catch (err) {
                    if (attempt < maxRetries) {
                        attempt++;
                        const delay = Math.pow(2, attempt) * 1000;
                        console.warn(`[Shelby Patch] Network Error. Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`, err);
                        await new Promise(r => setTimeout(r, delay));
                        return executeFetch();
                    }
                    throw err;
                }
            };

            try {
                return await executeFetch();
            } finally {
                if (isPartUpload) {
                    (window as any)._shelbyActiveUploads--;
                }
            }
        };
        (window as any)._shelbyPatched = true;
    }
}

interface VaultDropzoneProps {
    refetch?: () => void;
}

const DURATION_OPTIONS = [
    { label: '7 Days', value: 7 * 24 * 60 * 60 * 1000000, months: 0.25 },
    { label: '1 Month', value: 30 * 24 * 60 * 60 * 1000000, months: 1 },
    { label: '3 Months', value: 90 * 24 * 60 * 60 * 1000000, months: 3 },
    { label: '6 Months', value: 180 * 24 * 60 * 60 * 1000000, months: 6 },
    { label: '1 Year', value: 365 * 24 * 60 * 60 * 1000000, months: 12 },
];

export function VaultDropzone({ refetch }: VaultDropzoneProps) {
    const router = useRouter();
    const { account, signAndSubmitTransaction, wallet } = useWallet();
    const { ensureKey, encryptionKey } = useVaultKey();
    const [isDragging, setIsDragging] = useState(false);
    const [encryptionEnabled, setEncryptionEnabled] = useState(false);
    const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'success'>('idle');
    const [uploadStatusText, setUploadStatusText] = useState<string>("Encrypting and distributing to nodes...");
    const [lastTxHash, setLastTxHash] = useState<string | null>(null);
    const [selectedDuration, setSelectedDuration] = useState(DURATION_OPTIONS[1]); // Default 1 Month
    const [totalSize, setTotalSize] = useState<number>(0);
    const [uploadMode, setUploadMode] = useState<'vault' | 'micropayment'>('vault');
    const [priceShelbyUSD, setPriceShelbyUSD] = useState<string>('0.1');
    const [datasetCategory, setDatasetCategory] = useState<string>('NLP');
    const [datasetDescription, setDatasetDescription] = useState<string>('');
    const [datasetAccess, setDatasetAccess] = useState<'paid' | 'free'>('free');

    // Utility to ensure blob names are URL and SDK friendly (replaces spaces with underscores)
    const getSafeMarketName = (name: string) => {
        return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    };

    // Multi-file queue state
    const [queue, setQueue] = useState<File[]>([]);
    const [currentIndex, setCurrentIndex] = useState<number>(0);
    const [currentFile, setCurrentFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [successCount, setSuccessCount] = useState<number>(0);
    const [failCount, setFailCount] = useState<number>(0);

    const [pendingUploads, setPendingUploads] = useState<{
        blobs: { blobName: string, blobData: Blob | Uint8Array }[],
        files: File[]
    } | null>(null);
    const [generatedLinks, setGeneratedLinks] = useState<{ name: string, id: string, seller?: string, price?: string }[]>([]);

    const uploadBlobs = useUploadBlobs({});

    const dropzoneRef = useRef<HTMLDivElement>(null);
    const iconRef = useRef<HTMLDivElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!iconRef.current) return;
        if (isDragging) {
            gsap.to(iconRef.current, { scale: 1.2, y: -10, duration: 0.4, ease: "back.out(1.7, 0.3)" });
        } else {
            gsap.to(iconRef.current, { scale: 1, y: 0, duration: 0.4, ease: "power2.out" });
        }
    }, [isDragging]);

    // Removed restrictive logical enforcement to allow Paid Public Datasets
    // while ACE monetization is under maintenance.

    useEffect(() => {
        if (uploadState === 'uploading' && progressRef.current) {
            // Force reset in case of previous animations
            gsap.set(progressRef.current, { clearProps: "all" });

            const anim = gsap.fromTo(progressRef.current,
                { left: "-50%", width: "50%", position: 'absolute' },
                { left: "100%", duration: 1.2, repeat: -1, ease: "none" }
            );
            return () => { anim.kill(); };
        }
    }, [uploadState, currentIndex, pendingUploads]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDeploy = async () => {
        if (!pendingUploads || !account) return;

        setUploadState('uploading');
        setUploadStatusText("Awaiting wallet approval...");
        setCurrentIndex(0);

        let txHash: string | undefined;
        let caughtResponse: any = null;

        // Save a reference to the data before clearing pendingUploads
        const backupBlobs = [...pendingUploads.blobs];
        const backupFiles = [...pendingUploads.files];

        try {
            console.log("[Shelby] Initiating batch upload. Signer address:", account.address.toString());

            // Re-show progress bar & set status
            setPendingUploads(null);
            // Keep currentFile and currentIndex from the last processed file 
            // Robustly prepare blobs for the Shelby SDK
            const blobsForSdk = await Promise.all(backupBlobs.map(async (b) => {
                let bytes: Uint8Array;
                const data = b.blobData as any;
                if (data instanceof Uint8Array) {
                    bytes = data;
                } else if (data instanceof Blob) {
                    const ab = await data.arrayBuffer();
                    bytes = new Uint8Array(ab);
                } else {
                    console.error("[Shelby] Incompatible blobData type:", typeof data);
                    bytes = new Uint8Array(0);
                }
                return {
                    blobName: b.blobName,
                    blobData: bytes
                };
            }));

            const isMarket = uploadMode === 'micropayment';
            const effectivePrice = datasetAccess === 'free' ? '0' : priceShelbyUSD;
            
            console.log("[Shelby] Dataset stats:", { 
                mode: isMarket ? "Marketplace" : "Vault", 
                count: blobsForSdk.length, 
                totalSize: blobsForSdk.reduce((acc, b) => acc + b.blobData.length, 0),
                encryption: encryptionEnabled ? "ACE" : "Plaintext"
            });
            // Re-confirm sanitization for deployment
            const sanitize = (v: string, l: number) => v.slice(0, l).toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
            const safeDesc = sanitize(datasetDescription, 20) || "untitled";

            // Step 1: Storage Payment and Blob Upload
            try {
                setUploadStatusText(isMarket 
                    ? (encryptionEnabled ? "Step 1/2: Securing & storing ACE protected file..." : "Step 1/2: Storing dataset on secure storage...") 
                    : "Uploading to secure network...");

                // Robustly calculate expiration to prevent NaN -> BigInt crashes
                const durationValue = Number(selectedDuration?.value) || 0;
                let actualExpiration = Date.now() * 1000 + durationValue;
                
                if (isMarket && !encryptionEnabled) {
                    const maxTestnetDuration = 30 * 24 * 60 * 60 * 1000000;
                    actualExpiration = Date.now() * 1000 + Math.min(durationValue, maxTestnetDuration);
                }

                if (isNaN(actualExpiration)) {
                    console.error("[Shelby] Expiration calculation resulted in NaN. Falling back to default.");
                    actualExpiration = Date.now() * 1000 + 30 * 24 * 60 * 60 * 1000000;
                }

                await uploadBlobs.mutateAsync({
                    signer: {
                        account: account.address.toString(),
                        signAndSubmitTransaction: async (tx: any) => {
                            console.log("[Shelby] Wallet signing request (direct context):", tx);

                            // Update status when wallet is reached
                            if (isMarket) {
                                setUploadStatusText(encryptionEnabled 
                                    ? "Step 1/2: Submitting ACE permit to protocol..." 
                                    : "Step 1/2: Storing asset on decentralized network...");
                            } else {
                                setUploadStatusText(encryptionEnabled 
                                    ? "Securing & submitting to network..." 
                                    : "Submitting to network...");
                            }

                            // Specific transaction cleanup for Aptos wallets
                            let finalTx = tx;
                            const walletName = wallet?.name || (account as any)?.wallet?.name || "";
                            const isSocialLogin = walletName === 'Aptos Connect';
                            
                             console.log(`[Shelby] Transaction Step 1 simulation:`, { 
                                 wallet: walletName, 
                                 social: isSocialLogin,
                                 payload: JSON.parse(JSON.stringify(finalTx, (_, v) => typeof v === 'bigint' ? v.toString() : v))
                             });
                             
                             if (finalTx && typeof finalTx === 'object') {
                                 if ('sequence_number' in finalTx) delete finalTx.sequence_number;
                                 if (isSocialLogin && 'sender' in finalTx) {
                                     delete finalTx.sender;
                                 }
                             }

                             // Final sanity check for NaN in the payload before it leaves to wallet
                             const txStr = JSON.stringify(finalTx);
                             if (txStr.includes(':null') || txStr.includes(':NaN')) {
                                 console.error("[Shelby] CRITICAL: Transaction payload contains sanitized null/NaN values!", finalTx);
                             }

                             return await signAndSubmitTransaction(finalTx);
                        },
                    },
                    blobs: blobsForSdk,
                    expirationMicros: actualExpiration,
                });
            } catch (step1Err: any) {
                console.error("[Shelby] Step 1 (Storage) Error:", step1Err);
                const msg = step1Err.message || String(step1Err);
                // More helpful error but less 'scary' for standard vault rejection
                throw new Error(isMarket ? `Storage Payment Simulation Failed: ${msg.slice(0, 100)}` : `Vault Upload Failed: ${msg.slice(0, 100)}`);
            }

            // Step 2: Marketplace Registration (On-Chain)
            if (isMarket) {
                setUploadStatusText("Step 2/2: Generating MicroPaylink handle...");
                const walletName = wallet?.name || (account as any)?.wallet?.name || "";
                const isSocialLogin = walletName === 'Aptos Connect';
                
                for (let i = 0; i < backupBlobs.length; i++) {
                    const b = backupBlobs[i];
                    const marketName = b.blobName;
                    
                    // Robustly parse price to prevent NaN -> BigInt crashes
                    const parsedPrice = parseFloat(effectivePrice);
                    const priceU64 = isNaN(parsedPrice) ? 0 : Math.floor(parsedPrice * 100_000_000);

                    console.log(`[Marketplace] Dedicated registration phase for: ${marketName}`);
                    
                    // Delay slightly to ensure wallet resets
                    await new Promise(r => setTimeout(r, 1500)); 

                    try {
                        const mkPayload: any = {
                            data: {
                                function: `${MARKETPLACE_REGISTRY_ADDRESS}::marketplace::list_dataset`,
                                functionArguments: [
                                    marketName,
                                    priceU64.toString(),
                                    datasetCategory.toLowerCase(),
                                    safeDesc,
                                    SHELBYUSD_FA_METADATA_ADDRESS
                                ]
                            }
                        };
                        
                        // For social login, we MUST provide sender
                        if (isSocialLogin) {
                            mkPayload.sender = account.address;
                        }

                        console.log(`[Marketplace] Transaction Step 2 simulation:`, { 
                            wallet: walletName, 
                            payload: mkPayload 
                        });

                        const mkResponse = await signAndSubmitTransaction(mkPayload);
                        console.log("[Marketplace] Registration Success. Hash:", (mkResponse as any)?.hash);
                        
                        if (mkResponse && (mkResponse as any).hash) {
                            caughtResponse = mkResponse;
                        }
                    } catch (regErr: any) {
                        console.error("[Marketplace] Step 2 (Registration) Error:", regErr);
                        const simError = regErr?.simulation_error || regErr?.reason || regErr?.message || String(regErr);
                        toast.error(`Registration Simulation Failed: ${simError.slice(0, 50)}...`);
                        // We don't throw here to allow the process to finish if storage succeeded
                    }
                }
            }

            console.log("[Shelby] Batch upload completed. Captured response:", caughtResponse);
            if (caughtResponse && (caughtResponse as any).hash) {
                txHash = (caughtResponse as any).hash;
                setLastTxHash(txHash || null);
            }

            // Optimistic Store for Marketplace specifically
            if (uploadMode === 'micropayment') {
                try {
                    const pendingMarkets = JSON.parse(localStorage.getItem('sv_pending_markets') || '[]');
                    backupBlobs.forEach((b, i) => {
                        const marketName = b.blobName;
                        pendingMarkets.push({
                            blob_name: marketName,
                            owner: account.address.toString(),
                            account_address: account.address.toString(),
                            signer: account.address.toString(),
                            size: b.blobData instanceof Uint8Array ? b.blobData.length : b.blobData.size,
                            created_at: Date.now(),
                            is_deleted: false,
                            is_optimistic: true
                        });
                    });
                    localStorage.setItem('sv_pending_markets', JSON.stringify(pendingMarkets));
                } catch (e) { }
            }

            // Handle success events for each file
            backupFiles.forEach(file => {
                window.dispatchEvent(new CustomEvent('vault:uploadSuccess', {
                    detail: {
                        name: file.name,
                        size: file.size,
                        txHash: txHash || "unknown",
                        timestamp: Date.now(),
                        isEncrypted: encryptionEnabled
                    }
                }));
            });

            // Capture links for success view
            if (isMarket) {
                const newLinks = backupBlobs.map((b, i) => {
                    return { 
                        name: backupFiles[i].name, 
                        id: b.blobName, 
                        seller: account.address.toString(),
                        price: effectivePrice
                    };
                });
                setGeneratedLinks(newLinks);
            }

            setSuccessCount(backupFiles.length);
            setUploadState('success');
            setUploadStatusText(isMarket 
                ? (encryptionEnabled ? "Payment handles & ACE permits generated successfully." : "Public MicroPaylink handles generated successfully.") 
                : (encryptionEnabled ? "Assets secured and backed up." : "Assets stored successfully."));

            if (uploadMode === 'micropayment') {
                toast.success("MicroPaylink handles are ready to share!", { duration: 5000 });
            }
        } catch (sdkError) {
            console.error("[Shelby SDK Error]", sdkError);
            const msg = sdkError instanceof Error ? sdkError.message : String(sdkError);
            toast.error(`Upload failed: ${msg.slice(0, 100)}...`, { id: 'upload-error' });

            // If it failed, we restore pendingUploads to allow RETRY
            setPendingUploads({ blobs: backupBlobs, files: backupFiles });
            setUploadState('uploading'); // Keep in progress view but wait for user to click retry or cancel
        }
    };

    const prepareUploads = async (files: File[]) => {
        if (!account) {
            toast.error("Please connect your Aptos wallet first!");
            return;
        }
        if (files.length === 0) return;

        setUploadState('uploading');
        setQueue(files);

        const sumSize = files.reduce((acc, f) => acc + f.size, 0);
        setTotalSize(sumSize);

        const blobs: { blobName: string, blobData: Blob | Uint8Array }[] = [];
        const processedFiles: File[] = [];

        try {
            if (uploadMode === 'micropayment' && encryptionEnabled) {
                // --- ACE ENCRYPTED MICROPAYMENT PATH ---
                setUploadStatusText("Initializing ACE Protocol...");

                const committee = new ace.Committee({
                    workerEndpoints: [
                        "https://ace-worker-0-646682240579.europe-west1.run.app/",
                        "https://ace-worker-1-646682240579.europe-west1.run.app/",
                    ],
                    threshold: 2,
                });

                const contractId = ace.ContractID.newAptos({
                    chainId: 2, // Testnet
                    moduleAddr: AccountAddress.fromString(MARKETPLACE_REGISTRY_ADDRESS),
                    moduleName: "marketplace",
                    functionName: "check_permission",
                });

                const encryptionKeyResult = await ace.EncryptionKey.fetch({ committee });
                const encryptionKey = encryptionKeyResult.unwrapOrThrow(new Error("Failed to fetch ACE encryption key. Worker endpoints might be unreachable."));

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    setCurrentFile(file);
                    setCurrentIndex(i);
                    setUploadStatusText(`Encrypting ${file.name} for Marketplace (${i + 1}/${files.length})...`);

                    const effectivePrice = datasetAccess === 'free' ? '0' : priceShelbyUSD;
                    
                    // Stricter sanitization for URL-safe blob names on Shelby nodes
                    // REMOVED dots entirely from name segments and FORCED lowercase for perfect registry parity
                    const sanitize = (v: string, l: number) => v.slice(0, l).toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
                    const safeDesc = sanitize(datasetDescription, 20) || "untitled";
                    const safeCategory = sanitize(datasetCategory, 15) || "uncategorized";
                    const safePrice = sanitize(effectivePrice, 10) || "0";
                    
                    // For original filename, replace dot with underscore and force lowercase
                    const safeOriginal = sanitize(file.name, 30);

                    // Short, clean blob name with 8-char unique suffix for collision avoidance
                    // Format: originalname_a3f7b2c1.svmarket
                    // Metadata (price/category/description) is stored on-chain via list_dataset
                    const uniqueId = Array.from(crypto.getRandomValues(new Uint8Array(4)))
                        .map(b => b.toString(16).padStart(2, '0')).join('');
                    const marketName = `paylink--${account.address.toString()}--${safeOriginal}_${uniqueId}.svmarket`;
                    console.log(`[ACE] Encryption domain (marketName): ${marketName}`);
                    const domain = new TextEncoder().encode(marketName);

                    const fileBuffer = new Uint8Array(await file.arrayBuffer());
                    const { ciphertext } = ace.encrypt({
                        encryptionKey,
                        contractId,
                        domain,
                        plaintext: fileBuffer,
                    }).unwrapOrThrow(new Error("Encryption failed"));

                    const cipherBytes = ciphertext.toBytes ? ciphertext.toBytes() : (ciphertext as any).bcsToBytes();
                    console.log(`[ACE] Encrypted size: ${cipherBytes.length} bytes`);

                    blobs.push({
                        blobName: marketName,
                        blobData: cipherBytes
                    });
                    processedFiles.push(file);

                    const fileInfo = getFileType(file.name, file.type);
                    if (fileInfo.isImage || fileInfo.isVideo) {
                        const url = URL.createObjectURL(file);
                        setPreviewUrl(url);
                    }
                }

                setPendingUploads({ blobs, files: processedFiles });
                setUploadStatusText("Assets encrypted via ACE and ready for deployment.");
            } else if (uploadMode === 'micropayment' && !encryptionEnabled) {
                // --- PLAINTEXT MICROPAYMENT PATH (ALIGNED WITH VAULT) ---
                // We use original File objects to avoid simulation errors, same as Private Vault
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    setCurrentFile(file);
                    setCurrentIndex(i);
                    setUploadStatusText(`Preparing ${file.name} for Marketplace (${i + 1}/${files.length})...`);
                    
                    // Sanitize filename for public links to prevent SDK/Browser issues with spaces
                    const marketName = getSafeMarketName(file.name);
                    
                    blobs.push({
                        blobName: marketName,
                        blobData: file // USE ORIGINAL FILE OBJECT (SAME AS VAULT)
                    });
                    processedFiles.push(file);

                    const fileInfo = getFileType(file.name, file.type);
                    if (fileInfo.isImage || fileInfo.isVideo) {
                        const url = URL.createObjectURL(file);
                        setPreviewUrl(url);
                    }
                }

                setPendingUploads({ blobs, files: processedFiles });
                setUploadStatusText("Assets ready for marketplace (unencrypted).");
            } else if (encryptionEnabled) {
                // --- ENCRYPTED PATH ---
                setUploadStatusText("Initializing security protocol...");
                const cryptoKey = await ensureKey();
                if (!cryptoKey) {
                    setUploadState('idle');
                    return;
                }

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    setCurrentFile(file);
                    setCurrentIndex(i);
                    setUploadStatusText(`Encrypting ${file.name} (${i + 1}/${files.length})...`);

                    const encryptedBlob = await encryptFile(file, cryptoKey);
                    const encryptedNameBase64 = await encryptText(file.name, cryptoKey);
                    const safeEncryptedName = encryptedNameBase64.replace(/\//g, '_').replace(/\+/g, '-');

                    blobs.push({
                        blobName: `${safeEncryptedName}.vault`,
                        blobData: encryptedBlob
                    });
                    processedFiles.push(file);

                    const fileInfo = getFileType(file.name, file.type);
                    if (fileInfo.isImage || fileInfo.isVideo) {
                        const url = URL.createObjectURL(file);
                        setPreviewUrl(url);
                    }
                }

                setPendingUploads({ blobs, files: processedFiles });
                setUploadStatusText("Assets encrypted and ready for deployment.");
            } else {
                // --- PLAINTEXT PATH ---
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    setCurrentFile(file);
                    setCurrentIndex(i);
                    setUploadStatusText(`Preparing ${file.name} (${i + 1}/${files.length})...`);

                    // Use Blob for plaintext to avoid large ArrayBuffer allocation early
                    const fileBlob = new Blob([file]);

                    // Use safe market name for plaintext links to prevent SDK/Browser issues
                    const marketName = getSafeMarketName(file.name);

                    blobs.push({
                        blobName: marketName,
                        blobData: fileBlob
                    });
                    processedFiles.push(file);

                    const fileInfo = getFileType(file.name, file.type);
                    if (fileInfo.isImage || fileInfo.isVideo) {
                        const url = URL.createObjectURL(file);
                        setPreviewUrl(url);
                    }
                }

                setPendingUploads({ blobs, files: processedFiles });
                setUploadStatusText("Assets ready for deployment (no encryption).");
            }
        } catch (error) {
            console.error("File preparation failed:", error);
            toast.error("Failed to prepare some files.");
            setUploadState('idle');
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            prepareUploads(Array.from(e.dataTransfer.files));
        }
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            prepareUploads(Array.from(e.target.files));
        }
    };

    const resetTarget = () => {
        setQueue([]);
        setCurrentFile(null);
        setCurrentIndex(0);
        setSuccessCount(0);
        setFailCount(0);
        setGeneratedLinks([]);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setUploadState('idle');
        setUploadStatusText("Encrypting and distributing to nodes...");
        setLastTxHash(null);
        setPendingUploads(null);
        setTotalSize(0);
        setDatasetDescription('');
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const totalFiles = queue.length;

    const renderPreview = () => {
        if (!currentFile) return null;
        const info = getFileType(currentFile.name, currentFile.type);

        if (previewUrl && info.isImage) {
            return (
                <div className="w-32 h-32 mb-6 rounded-xl overflow-hidden border border-white/20 shadow-2xl relative">
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-color-primary/20 animate-pulse mix-blend-overlay" />
                </div>
            );
        }

        if (previewUrl && info.isVideo) {
            return (
                <div className="w-48 h-32 mb-6 rounded-xl overflow-hidden border border-white/20 shadow-2xl relative bg-black">
                    <video src={previewUrl} muted loop autoPlay playsInline className="w-full h-full object-cover opacity-60" />
                    <div className="absolute inset-0 bg-color-primary/20 animate-pulse mix-blend-overlay" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full border border-white/30 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                            <FileIcon size={20} className="text-white animate-pulse" />
                        </div>
                    </div>
                </div>
            );
        }

        // Icons for documents/others
        let Icon = FileIcon;
        let iconColor = "text-color-accent";
        let bgColor = "bg-color-deep";

        if (info.isAudio) { Icon = Music; iconColor = "text-blue-400"; bgColor = "bg-blue-500/10"; }
        else if (info.isSpreadsheet) { Icon = FileSpreadsheet; iconColor = "text-green-400"; bgColor = "bg-green-500/10"; }
        else if (info.isPresentation) { Icon = Presentation; iconColor = "text-orange-400"; bgColor = "bg-orange-500/10"; }
        else if (info.isArchive) { Icon = Archive; iconColor = "text-purple-400"; bgColor = "bg-purple-500/10"; }
        else if (info.isPdf || info.isText) { Icon = FileText; iconColor = "text-red-400"; bgColor = "bg-red-500/10"; }

        return (
            <div className={`w-20 h-20 rounded-2xl glass-panel flex items-center justify-center mb-6 ${iconColor} animate-pulse ${bgColor} border border-white/5`}>
                <Icon size={40} />
            </div>
        );
    };

    const getEstimatedCost = () => {
        if (totalSize === 0) return "0.000";
        // Simple formula: Size (MB) * Duration (Months) * 0.0001 APT
        const sizeMB = totalSize / (1024 * 1024);
        const cost = sizeMB * selectedDuration.months * 0.0001;
        return cost.toFixed(4);
    };

    return (
        <section id="vault" className="py-20 md:py-24 relative z-10 px-6">
            <div className="container mx-auto max-w-4xl text-center mb-8 md:mb-12">
                <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white tracking-tight">The Storage Vault</h2>
                <p className="text-color-support/70 text-base md:text-xl font-light max-w-2xl mx-auto">Drag &amp; drop your digital assets to encrypt and fracture them across the global network.</p>
            </div>

            <div className="container mx-auto max-w-2xl relative">
                <GlassCard
                    className={`transition-all duration-500 overflow-hidden relative bg-[#111827]/80 backdrop-blur-2xl hover:scale-[1.02] hover:-translate-y-2 hover:shadow-[0_20px_60px_rgba(251,179,204,0.3)] ${isDragging ? 'border-color-primary shadow-[0_0_50px_rgba(251,179,204,0.3)] bg-color-primary/10 scale-[1.03]' : 'border-white/10'
                        }`}
                >
                    <div
                        ref={dropzoneRef}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`w-full min-h-[300px] md:min-h-[400px] flex flex-col items-center justify-center p-5 md:p-10 relative z-10 transition-colors rounded-3xl ${isDragging ? 'bg-color-primary/5 shadow-[inset_0_0_100px_rgba(232,58,118,0.1)]' : 'bg-transparent'}`}
                    >
                        <input
                            type="file"
                            multiple
                            ref={fileInputRef}
                            onChange={handleFileInput}
                            className="hidden"
                        />

                        {/* Vault Locked */}
                        {!encryptionKey ? (
                            <div className="flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-500 w-full px-4">
                                <div ref={iconRef} className="w-20 h-20 md:w-24 md:h-24 rounded-full glass-panel flex items-center justify-center mb-6 text-color-primary bg-[#1A0D12] shadow-[0_0_30px_rgba(232,58,118,0.2)] border border-color-primary/30">
                                    <Lock size={40} strokeWidth={1.5} className="md:hidden text-color-primary" />
                                    <Lock size={48} strokeWidth={1.5} className="hidden md:block text-color-primary" />
                                </div>
                                <h3 className="text-2xl md:text-3xl font-semibold mb-3 text-white tracking-tight">Vault Locked</h3>
                                <p className="text-color-support/70 mb-8 text-sm md:text-lg">Unlock your vault to secure new assets.</p>
                                <button
                                    onClick={(e) => { e.stopPropagation(); ensureKey(false); }}
                                    className="mt-4 px-10 py-4 rounded-full bg-color-primary/20 border border-color-primary/40 text-white transition-all duration-700 font-bold shadow-lg shadow-[0_0_20px_rgba(232,58,118,0.2)] hover:bg-color-primary hover:scale-110 hover:shadow-[0_0_35px_rgba(232,58,118,0.5)] animate-glow-activate w-full sm:w-auto uppercase text-xs tracking-widest"
                                >
                                    Unlock Vault
                                </button>
                            </div>
                        ) : uploadState === 'idle' && (
                            <div className="flex flex-col items-center text-center w-full max-w-lg mx-auto px-1 md:px-4">

                                {/* Mode Switcher */}
                                <div className="flex w-full max-w-[280px] bg-black/40 rounded-full p-1 mb-6 border border-white/10 relative z-20 shadow-inner">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setUploadMode('vault'); }}
                                        className={`flex-1 flex justify-center items-center gap-1.5 py-2.5 text-[11px] md:text-xs font-bold rounded-full transition-all duration-300 ${uploadMode === 'vault' ? 'bg-gradient-to-br from-color-primary to-color-accent text-white shadow-[0_0_15px_rgba(232,58,118,0.4)]' : 'text-white/40 hover:text-white/80'}`}
                                    >
                                        <Shield size={14} /> Private Vault
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setUploadMode('micropayment'); }}
                                        className={`flex-1 flex justify-center items-center gap-1.5 py-2.5 text-[11px] md:text-xs font-bold rounded-full transition-all duration-300 ${uploadMode === 'micropayment' ? 'bg-gradient-to-br from-color-primary to-color-accent text-white shadow-[0_0_15px_rgba(232,58,118,0.4)]' : 'text-white/40 hover:text-white/80'}`}
                                    >
                                        <Banknote size={14} /> MicroPaylink
                                    </button>
                                </div>

                                {/* Top SoobinVault Glass Icon */}
                                <div
                                    className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center mb-3 md:mb-4 transition-transform duration-500 ${uploadMode === 'micropayment'
                                        ? 'bg-gradient-to-b from-[#2e2b1c] to-[#0d0d0d] border-2 border-yellow-500/50 shadow-[0_0_30px_rgba(234,179,8,0.2)]'
                                        : encryptionEnabled
                                            ? 'bg-gradient-to-b from-[#3a1c3b] to-[#1A0D12] border-2 border-yellow-500/50 shadow-[0_0_30px_rgba(234,179,8,0.2)]'
                                            : 'glass-panel bg-[#1A0D12]/80 border border-white/10'
                                        }`}
                                >
                                    {uploadMode === 'micropayment' ? (
                                        <Banknote size={28} strokeWidth={2} className="text-yellow-400 drop-shadow-[0_0_10px_rgba(234,179,8,0.6)]" />
                                    ) : encryptionEnabled ? (
                                        <ShieldCheck size={28} strokeWidth={2} className="text-yellow-400 drop-shadow-[0_0_10px_rgba(234,179,8,0.6)]" />
                                    ) : (
                                        <Shield size={28} strokeWidth={2} className="text-yellow-500/50" />
                                    )}
                                </div>

                                <h3 className="text-xl md:text-3xl font-bold mb-1 md:mb-2 text-white tracking-tight">
                                    {uploadMode === 'micropayment' 
                                        ? (encryptionEnabled ? 'Monetize AI Dataset' : 'Share Public Dataset')
                                        : 'Deploy Assets'}
                                </h3>
                                <p className="text-color-support/80 mb-4 md:mb-6 text-xs md:text-sm px-4">
                                    {uploadMode === 'micropayment' 
                                        ? (encryptionEnabled ? 'Upload files and set a price in ShelbyUSD for encrypted access.' : 'Upload files for public access. These assets will be free for everyone.')
                                        : 'Drag and drop your files, or select from your device.'}
                                </p>

                                {uploadMode === 'micropayment' && (
                                    <div className="w-full max-w-xs md:max-w-[420px] mb-4 text-left animate-in fade-in duration-300">

                                        <label className="block text-[11px] md:text-sm text-white/70 font-semibold mb-1.5 ml-1">Access Type</label>
                                        {!encryptionEnabled ? (
                                            <div className="flex w-full bg-white/5 rounded-xl p-3.5 mb-4 border border-white/10 items-center gap-3 animate-in fade-in slide-in-from-top-1 duration-300">
                                                <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20">
                                                    <Globe size={16} className="text-yellow-400" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-white tracking-wide">Public Access</span>
                                                    <span className="text-[10px] text-white/40 font-medium tracking-tight">Encryption disabled. This asset will be free to everyone.</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex w-full bg-black/40 rounded-full p-1 mb-4 border border-yellow-500/30 shadow-inner">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setDatasetAccess('free'); }}
                                                    className={`flex-1 flex justify-center items-center gap-1.5 py-2.5 text-[11px] md:text-xs font-bold rounded-full transition-all duration-300 ${datasetAccess === 'free' ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(234,179,8,0.3)]' : 'text-white/40 hover:text-white/80'}`}
                                                >
                                                    <Globe size={14} /> Free
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setDatasetAccess('paid'); }}
                                                    className={`flex-1 flex justify-center items-center gap-1.5 py-2.5 text-[11px] md:text-xs font-bold rounded-full transition-all duration-300 ${datasetAccess === 'paid' ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-black shadow-[0_0_15px_rgba(234,179,8,0.3)]' : 'text-white/40 hover:text-white/80'}`}
                                                >
                                                    <Banknote size={14} /> Paid
                                                </button>
                                            </div>
                                        )}

                                        {datasetAccess === 'paid' && (
                                            <>
                                                <label className="block text-[11px] md:text-sm text-white/70 font-semibold mb-1.5 ml-1 mt-2">Asset Price (ShelbyUSD)</label>
                                                <div className="relative group">
                                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                        <Tag size={16} className="text-color-support/50 group-focus-within:text-yellow-400 transition-colors" />
                                                    </div>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={priceShelbyUSD}
                                                        onChange={(e) => setPriceShelbyUSD(e.target.value)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="w-full bg-[#050505]/80 border border-yellow-500/30 focus:border-yellow-400/80 focus:ring-1 focus:ring-yellow-500/50 rounded-xl py-3 pl-10 pr-24 text-white text-sm outline-none transition-all placeholder:text-white/20 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-mono"
                                                        placeholder="0.1"
                                                    />
                                                    <div className="absolute inset-y-0 right-1 flex items-center gap-1 pr-1.5">
                                                        <button
                                                            onClick={(e) => { 
                                                                e.stopPropagation(); 
                                                                setPriceShelbyUSD(prev => {
                                                                    const val = parseFloat(prev) || 0;
                                                                    return (Math.max(0, val - 0.1)).toFixed(1);
                                                                }); 
                                                            }}
                                                            className="w-6 h-6 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 hover:border-yellow-500/50 transition-all font-bold"
                                                        >-</button>
                                                        <button
                                                            onClick={(e) => { 
                                                                e.stopPropagation(); 
                                                                setPriceShelbyUSD(prev => {
                                                                    const val = parseFloat(prev) || 0;
                                                                    return (val + 0.1).toFixed(1);
                                                                }); 
                                                            }}
                                                            className="w-6 h-6 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 hover:border-yellow-500/50 transition-all font-bold"
                                                        >+</button>
                                                        <span className="text-[9px] font-black text-yellow-400 uppercase tracking-widest ml-1 mr-1.5 select-none">SUSD</span>
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        <label className="block text-[11px] md:text-sm text-white/70 font-semibold mb-1.5 ml-1 mt-4">Dataset Category</label>
                                        <div className="relative group mb-2">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <BrainCircuit size={16} className="text-color-support/50 group-focus-within:text-yellow-400 transition-colors" />
                                            </div>
                                            <select
                                                value={datasetCategory}
                                                onChange={(e) => setDatasetCategory(e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-full appearance-none bg-[#050505]/80 border border-yellow-500/30 focus:border-yellow-400/80 focus:ring-1 focus:ring-yellow-500/50 rounded-xl py-3 pl-10 pr-10 text-white text-sm outline-none transition-all shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] cursor-pointer"
                                            >
                                                <option value="NLP" className="bg-gray-900">🗣️ NLP — Natural Language Processing</option>
                                                <option value="Computer Vision" className="bg-gray-900">👁️ Computer Vision</option>
                                                <option value="Audio" className="bg-gray-900">🎙️ Audio & Speech</option>
                                                <option value="Sensors" className="bg-gray-900">📡 Sensors & IoT</option>
                                                <option value="Finance" className="bg-gray-900">📈 Finance & Trading</option>
                                                <option value="Biology" className="bg-gray-900">🧬 Biology & Genomics</option>
                                                <option value="Medical" className="bg-gray-900">🏥 Medical & Healthcare</option>
                                                <option value="Robotics" className="bg-gray-900">🤖 Robotics & Simulation</option>
                                                <option value="Multimodal" className="bg-gray-900">🔀 Multimodal</option>
                                                <option value="Other" className="bg-gray-900">📦 Other</option>
                                            </select>
                                            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                                                <ChevronRight size={14} className="rotate-90 text-yellow-400/60" />
                                            </div>
                                        </div>

                                        <label className="block text-[11px] md:text-sm text-white/70 font-semibold mb-1.5 ml-1 mt-4">Dataset Description</label>
                                        <div className="relative group mb-4">
                                            <div className="absolute top-3 left-3 flex items-start pointer-events-none">
                                                <AlignLeft size={16} className="text-color-support/50 group-focus-within:text-yellow-400 transition-colors" />
                                            </div>
                                            <textarea
                                                value={datasetDescription}
                                                onChange={(e) => setDatasetDescription(e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                rows={3}
                                                className="w-full bg-[#050505]/80 border border-yellow-500/30 focus:border-yellow-400/80 focus:ring-1 focus:ring-yellow-500/50 rounded-xl py-3 pl-10 pr-4 text-white text-sm outline-none transition-all placeholder:text-white/20 shadow-[inset_0_2px_100_rgba(0,0,0,0.5)] resize-none"
                                                placeholder="Describe the contents, quality, and use cases of your dataset..."
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Visual Dashed Dropzone Indicator */}
                                <div className={`w-[85%] max-w-xs md:max-w-[420px] h-16 md:h-20 rounded-xl border-2 border-dashed mb-5 md:mb-6 flex flex-col items-center justify-center transition-all duration-300 pointer-events-none mx-auto ${isDragging ? (uploadMode === 'micropayment' ? 'border-yellow-500 bg-yellow-500/10 scale-105' : 'border-color-primary bg-color-primary/10 scale-105') : 'border-white/20 bg-black/20'}`}>
                                    <ArrowDown size={24} strokeWidth={1.5} className={`transition-all duration-300 ${isDragging ? (uploadMode === 'micropayment' ? 'text-yellow-500 animate-bounce' : 'text-color-primary animate-bounce') : 'text-white/40'}`} />
                                </div>

                                <button
                                    onClick={() => {
                                        if (uploadMode === 'micropayment' && encryptionEnabled) {
                                            toast.error("Monetization via ACE is under maintenance.");
                                            return;
                                        }
                                        fileInputRef.current?.click();
                                    }}
                                    disabled={uploadMode === 'micropayment' && encryptionEnabled}
                                    className={`w-[85%] max-w-xs md:max-w-[420px] py-3.5 md:py-4 rounded-full transition-all duration-500 font-bold uppercase text-[11px] md:text-xs tracking-widest mb-5 md:mb-6 mx-auto ${uploadMode === 'micropayment' && encryptionEnabled
                                        ? 'bg-white/5 border border-white/10 text-white/20 cursor-not-allowed grayscale'
                                        : uploadMode === 'micropayment'
                                            ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 border border-yellow-400/50 text-black shadow-[0_5px_15px_rgba(234,179,8,0.2)] hover:from-yellow-400 hover:to-yellow-500 hover:shadow-[0_8px_20px_rgba(234,179,8,0.4)] hover:scale-[1.02] active:scale-[0.98]'
                                            : encryptionEnabled
                                                ? 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-yellow-500 border border-yellow-200 text-yellow-950 shadow-[0_5px_30px_rgba(250,204,21,0.7)] hover:shadow-[0_10px_40px_rgba(250,204,21,0.9)] scale-105 animate-pulse-slow active:scale-[0.98]'
                                                : 'bg-gradient-to-r from-yellow-500 to-yellow-600 border border-yellow-400/50 text-black shadow-[0_5px_15px_rgba(234,179,8,0.2)] hover:from-yellow-400 hover:to-yellow-500 hover:shadow-[0_8px_20px_rgba(234,179,8,0.4)] hover:scale-[1.02] active:scale-[0.98]'
                                        }`}
                                >
                                    {uploadMode === 'micropayment' && encryptionEnabled ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <Clock size={14} className="animate-spin-slow" /> Coming Soon
                                        </span>
                                    ) : (
                                        'Select Files'
                                    )}
                                </button>

                                {uploadMode === 'micropayment' && encryptionEnabled && (
                                    <div className="w-[85%] max-w-xs md:max-w-[420px] mx-auto mb-6 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/10 flex items-start gap-3 animate-in fade-in zoom-in duration-500">
                                        <AlertCircle size={16} className="text-yellow-500 shrink-0 mt-0.5" />
                                        <p className="text-[10px] text-yellow-500/70 text-left leading-relaxed">
                                            ACE-Monetization is currently undergoing protocol maintenance. You can still upload <b>Public Datasets</b> by turning off the encryption toggle below.
                                        </p>
                                    </div>
                                )}

                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEncryptionEnabled(v => !v);
                                    }}
                                    className={`w-full max-w-xs md:max-w-[420px] mx-auto flex items-center justify-center gap-3 cursor-pointer group px-2`}
                                >
                                    {/* Checkbox square */}
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all duration-300 shrink-0 ${encryptionEnabled
                                        ? 'bg-color-primary border-color-primary text-white shadow-[0_0_10px_rgba(232,58,118,0.4)]'
                                        : 'border-white/40 bg-transparent group-hover:border-white/60'
                                        }`}>
                                        {encryptionEnabled && <Check size={14} strokeWidth={3} />}
                                    </div>

                                    {/* Lock Icon */}
                                    {encryptionEnabled ? (
                                        <Lock
                                            size={20}
                                            className="shrink-0 text-yellow-400 fill-yellow-400/20 drop-shadow-[0_0_12px_rgba(250,204,21,0.9)] transition-all duration-300 scale-110"
                                        />
                                    ) : (
                                        <Unlock
                                            size={18}
                                            className="shrink-0 text-yellow-500/80 transition-colors duration-300 group-hover:text-yellow-400"
                                        />
                                    )}

                                    {/* Text */}
                                    <span className={`text-[12px] md:text-sm tracking-wide transition-colors ${encryptionEnabled ? 'text-white font-medium' : 'text-white/60 group-hover:text-white/80'
                                        }`}>
                                        {uploadMode === 'micropayment' && !encryptionEnabled ? 'Upload as Public (Free)' : 'Encrypt file before upload'}
                                    </span>
                                </div>
                            </div>
                        )}
                        {/* Uploading / Encrypting state */}
                        {uploadState === 'uploading' && !pendingUploads && (
                            <div className="w-full max-w-lg flex flex-col items-center">
                                {renderPreview()}
                                {currentFile && <h3 className="text-xl font-medium mb-1 w-full text-center text-white break-all">{currentFile.name}</h3>}
                                {totalFiles > 1 && (
                                    <p className="text-color-primary/80 text-xs font-bold uppercase tracking-widest mb-2">
                                        Batch Progress: {currentIndex + 1} / {totalFiles}
                                    </p>
                                )}
                                <p className="text-color-support text-sm mb-8 text-center w-full">{uploadStatusText}</p>
                                <div className="w-full h-3 bg-black/50 rounded-full overflow-hidden border border-white/10 relative">
                                    <div ref={progressRef} className="h-full bg-gradient-to-r from-color-primary to-color-accent shadow-[0_0_10px_rgba(232,58,118,0.8)]" />
                                </div>
                            </div>
                        )}

                        {/* Ready to Deploy state */}
                        {uploadState === 'uploading' && pendingUploads && (
                            <div className="flex flex-col items-center text-center px-4 animate-in fade-in zoom-in-95 duration-500">
                                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-color-primary/20 border border-color-primary/30 flex items-center justify-center mb-6 text-color-primary shadow-[0_0_30px_rgba(232,58,118,0.2)]">
                                    <Shield size={32} strokeWidth={2} className="md:hidden" />
                                    <Shield size={40} strokeWidth={2} className="hidden md:block" />
                                </div>
                                <h3 className="text-xl md:text-2xl font-semibold mb-6 text-white tracking-tight">
                                    {encryptionEnabled ? 'Deploy Encrypted Assets' : 'Deploy Assets'}
                                </h3>

                                {/* Storage Duration Selection */}
                                <div className="w-full max-w-2xl flex flex-col gap-2 md:gap-3 mb-6 md:mb-8 text-left">
                                    {/* Estimated Cost Box */}
                                    <div className="bg-gradient-to-r from-color-primary/10 to-transparent border border-color-primary/30 rounded-xl md:rounded-2xl p-3.5 md:p-5 flex justify-between items-center gap-2 md:gap-0 transition-all hover:bg-color-primary/15 relative overflow-hidden group">
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-color-primary rounded-l-2xl" />
                                        <div className="pl-2 shrink min-w-0 pr-2">
                                            <h4 className="text-white font-semibold text-xs md:text-base tracking-wide flex items-center gap-1.5 md:gap-2 truncate">
                                                <Coins size={14} className="text-color-primary shrink-0" />
                                                <span className="truncate">Estimated Storage Cost</span>
                                            </h4>
                                            <p className="text-color-support/60 text-[10px] md:text-xs mt-0.5 md:mt-1 font-light truncate">For {selectedDuration.label.toLowerCase()} storage</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-color-primary font-bold text-base md:text-xl flex items-center justify-end gap-1.5 whitespace-nowrap">
                                                ~ {getEstimatedCost()} <span className="text-[10px] md:text-sm text-color-primary/70 font-semibold tracking-wider">APT</span>
                                            </p>
                                            <p className="text-color-support/60 text-[9px] md:text-xs mt-1 md:mt-1.5 uppercase tracking-widest whitespace-nowrap">Payload: {(totalSize / (1024 * 1024)).toFixed(2)} MB</p>
                                        </div>
                                    </div>

                                    {/* Storage Duration Row */}
                                    <div className="bg-white/5 border border-white/10 rounded-xl md:rounded-2xl p-3.5 md:p-5 flex justify-between items-center backdrop-blur-md gap-2 md:gap-0">
                                        <div className="scrollbar-hide shrink min-w-0 pr-2">
                                            <h4 className="text-white font-semibold text-xs md:text-base tracking-wide flex items-center gap-1.5 md:gap-2 truncate">
                                                <Calendar size={14} className="text-color-support/70 shrink-0" />
                                                <span className="truncate">Storage Duration</span>
                                            </h4>
                                            <p className="text-color-support/60 text-[10px] md:text-xs mt-0.5 md:mt-1 font-light truncate">How long to keep files on network</p>
                                        </div>
                                        <div className="relative group shrink-0">
                                            <select
                                                value={selectedDuration.label}
                                                onChange={(e) => {
                                                    const opt = DURATION_OPTIONS.find(o => o.label === e.target.value);
                                                    if (opt) setSelectedDuration(opt);
                                                }}
                                                className="w-24 md:w-48 appearance-none bg-black/40 border border-white/10 text-white text-[11px] md:text-sm font-medium rounded-lg md:rounded-xl px-2.5 md:px-3 py-2 md:py-3 pr-6 md:pr-8 outline-none focus:border-color-primary/50 cursor-pointer hover:bg-black/60 transition-colors"
                                            >
                                                {DURATION_OPTIONS.map(opt => (
                                                    <option key={opt.label} value={opt.label} className="bg-gray-900 text-white py-2">{opt.label}</option>
                                                ))}
                                            </select>
                                            <div className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 pointer-events-none text-color-support/60 group-hover:text-white transition-colors">
                                                <ChevronRight size={12} className="rotate-90 md:w-4 md:h-4" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDeploy(); }}
                                    className="w-full max-w-2xl px-12 py-4 rounded-xl bg-gradient-to-r from-color-primary to-color-accent text-white transition-all duration-300 font-bold shadow-[0_0_30px_rgba(232,58,118,0.3)] hover:scale-[1.02] active:scale-95 text-sm tracking-widest relative overflow-hidden group"
                                >
                                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                    <span className="relative flex items-center justify-center gap-2">
                                        Deploy {pendingUploads.files.length} Asset{pendingUploads.files.length !== 1 ? 's' : ''} <UploadCloud size={18} />
                                    </span>
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); resetTarget(); }}
                                    className="mt-6 text-white/30 hover:text-white/60 text-[10px] md:text-xs uppercase tracking-[0.2em] transition-colors pb-4"
                                >
                                    Cancel & Return
                                </button>
                            </div>
                        )}

                        {/* Success state */}
                        {uploadState === 'success' && (
                            <div className="flex flex-col items-center text-center px-4">
                                <div className="w-16 h-16 md:w-24 md:h-24 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mb-4 md:mb-6 text-green-400 shadow-[0_0_30px_rgba(74,222,128,0.2)]">
                                    <CheckCircle size={32} strokeWidth={2} className="md:hidden" />
                                    <CheckCircle size={48} strokeWidth={2} className="hidden md:block" />
                                </div>
                                <h3 className="text-xl md:text-3xl font-semibold mb-2 text-white">
                                    {successCount} {uploadMode === 'micropayment' 
                                        ? (encryptionEnabled ? 'Encrypted MicroPaylink' : 'Public MicroPaylink') 
                                        : (encryptionEnabled ? 'Encrypted Vault File' : 'Public Vault File')}{successCount !== 1 ? 's' : ''} Secured
                                </h3>
                                {failCount > 0 && (
                                    <div className="flex items-center gap-2 text-red-400 text-[10px] md:text-sm mb-2">
                                        <AlertCircle size={12} className="md:w-3.5 md:h-3.5" />
                                        <span>{failCount} file{failCount !== 1 ? 's' : ''} failed</span>
                                    </div>
                                )}
                                <p className="text-color-support text-xs md:text-lg mb-6 max-w-xs mx-auto">
                                    {successCount > 0 
                                        ? (uploadMode === 'micropayment' 
                                            ? (encryptionEnabled 
                                                ? 'Your assets are encrypted and monetization links are ready to be shared.' 
                                                : 'Your public assets are now listed and monetization links are ready to be shared.')
                                            : (encryptionEnabled 
                                                ? 'Decryption of these files will only be possible with your unique vault key.' 
                                                : 'These files are now stored as public assets on the soobinvault network.')) 
                                        : 'No files were uploaded successfully.'}
                                </p>


                                {generatedLinks.length > 0 && (
                                    <div className="w-[80%] md:w-full max-w-sm md:max-w-md mx-auto mb-6 space-y-2 md:space-y-3">
                                        <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] text-white/30 mb-2">
                                            {uploadMode === 'micropayment' ? 'Shareable MicroPaylinks' : 'Access Your Secured Assets'}
                                        </p>
                                        {generatedLinks.map((link, idx) => {
                                            // Embed seller address into newly generated link for instant indexer bypass
                                            const sellerQuery = link.seller ? `?s=${link.seller}` : '';
                                            const fullUrl = `${window.location.origin}/buy/${encodeURIComponent(link.id)}${sellerQuery}`;
                                            return (
                                                <div key={idx} className="flex items-center gap-2 md:gap-4 p-2 md:p-4 rounded-xl md:rounded-2xl bg-white/5 border border-white/10 group hover:border-yellow-500/30 transition-all backdrop-blur-sm">
                                                    <div className="w-8 h-8 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-500 shrink-0">
                                                        <Banknote size={16} className="md:w-6 md:h-6" />
                                                    </div>

                                                    <div className="flex-1 min-w-0 text-left flex flex-col justify-center">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <p className="text-[10px] md:text-[11px] text-white/90 md:text-white/60 truncate font-medium">{link.name}</p>
                                                            {link.price && (
                                                                <span className="px-1.5 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[8px] font-black uppercase tracking-wider">
                                                                    {link.price === '0' || link.price === '0.00' ? 'FREE' : `${link.price} SUSD`}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Ultra-clean layout with truncated URL and extra padding to shorten the visible characters */}
                                                        <p className="text-[9px] md:text-xs text-white/90 font-mono truncate pr-4 md:pr-1 mb-1">
                                                            {fullUrl}
                                                        </p>

                                                    </div>

                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigator.clipboard.writeText(fullUrl);
                                                            toast.success("Link copied!");
                                                        }}
                                                        className="p-2 md:px-5 md:py-2.5 flex items-center justify-center rounded-lg bg-yellow-500 text-black hover:bg-yellow-400 transition-all shadow-[0_3px_10px_rgba(234,179,8,0.2)] active:scale-95 shrink-0"
                                                    >
                                                        {/* Icon Only on Mobile */}
                                                        <Copy size={14} className="md:hidden stroke-[3px]" />
                                                        {/* Text Only on Desktop */}
                                                        <span className="hidden md:block text-[10px] font-black uppercase tracking-widest">
                                                            Copy
                                                        </span>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <button
                                    onClick={resetTarget}
                                    className="w-auto px-6 py-3 md:px-10 md:py-4 rounded-full bg-white text-black hover:bg-yellow-500 transition-all font-black uppercase tracking-[0.1em] md:tracking-widest text-[9px] md:text-sm shadow-[0_0_20px_rgba(255,255,255,0.2)] active:scale-95 mx-auto"
                                >
                                    Deploy More Assets
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Ambient drag glow */}
                    <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-color-primary/30 blur-[120px] rounded-full pointer-events-none transition-opacity duration-500 ${isDragging ? 'opacity-100' : 'opacity-0'}`} />

                </GlassCard>


            </div>
        </section>
    );
}
