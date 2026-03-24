"use client";

import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, File as FileIcon, CheckCircle, Link as LinkIcon, Lock, AlertCircle, Music, FileText, FileSpreadsheet, Presentation, Archive } from 'lucide-react';
import { encryptFile, encryptText } from '../utils/crypto';
import { useVaultKey } from '../context/VaultKeyContext';
import gsap from 'gsap';
import toast from 'react-hot-toast';
import { GlassCard } from './ui/GlassCard';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useUploadBlobs } from "@shelby-protocol/react";
import { getFileType } from '../utils/file';

interface VaultDropzoneProps {
    refetch?: () => void;
}

export function VaultDropzone({ refetch }: VaultDropzoneProps) {
    const { account, signAndSubmitTransaction } = useWallet();
    const { ensureKey, encryptionKey } = useVaultKey();
    const [isDragging, setIsDragging] = useState(false);
    const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'success'>('idle');
    const [uploadStatusText, setUploadStatusText] = useState<string>("Encrypting and distributing to nodes...");
    const [lastTxHash, setLastTxHash] = useState<string | null>(null);

    // Multi-file queue state
    const [queue, setQueue] = useState<File[]>([]);
    const [currentIndex, setCurrentIndex] = useState<number>(0);
    const [currentFile, setCurrentFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [successCount, setSuccessCount] = useState<number>(0);
    const [failCount, setFailCount] = useState<number>(0);

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

    useEffect(() => {
        if (uploadState === 'uploading' && progressRef.current) {
            const anim = gsap.fromTo(progressRef.current,
                { x: "-100%", width: "50%" },
                { x: "200%", duration: 1.5, repeat: -1, ease: "power1.inOut" }
            );
            return () => { anim.kill(); };
        }
    }, [uploadState, currentIndex]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const uploadSingleFile = async (
        droppedFile: File,
        cryptoKey: CryptoKey,
        index: number,
        total: number
    ): Promise<boolean> => {
        setCurrentFile(droppedFile);
        setCurrentIndex(index);

        const fileInfo = getFileType(droppedFile.name, droppedFile.type);

        if (fileInfo.isImage || fileInfo.isVideo) {
            const url = URL.createObjectURL(droppedFile);
            setPreviewUrl(prev => {
                if (prev) URL.revokeObjectURL(prev);
                return url;
            });
        } else {
            setPreviewUrl(prev => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
            });
        }

        try {
            setUploadStatusText(`Performing AES-256-GCM encryption...`);
            const encryptedData = await encryptFile(droppedFile, cryptoKey);

            const encryptedNameBase64 = await encryptText(droppedFile.name, cryptoKey);
            const safeEncryptedName = encryptedNameBase64.replace(/\//g, '_').replace(/\+/g, '-');
            const encryptedBlobName = `${safeEncryptedName}.vault`;

            setUploadStatusText(`Distributing encrypted fragments to nodes...`);

            let txHash: string | undefined;

            try {
                await uploadBlobs.mutateAsync({
                    signer: {
                        account: account!.address,
                        signAndSubmitTransaction: async (tx: any) => {
                            const response = await signAndSubmitTransaction(tx);
                            if (response && (response as any).hash) {
                                txHash = (response as any).hash;
                                setLastTxHash(txHash || null);
                            } else {
                                txHash = "unknown_hash";
                            }
                            return response;
                        },
                    },
                    blobs: [{
                        blobName: encryptedBlobName,
                        blobData: encryptedData
                    }],
                    expirationMicros: Date.now() * 1000 + 86400000000 * 30,
                });
            } catch (sdkError) {
                const msg = sdkError instanceof Error
                    ? sdkError.message.toLowerCase()
                    : String(sdkError).toLowerCase();

                const isUserCancellation =
                    msg.includes('user rejected') ||
                    msg.includes('user denied') ||
                    msg.includes('cancelled') ||
                    msg.includes('canceled') ||
                    msg.includes('4001');

                if (isUserCancellation) {
                    toast.error(`Cancelled: ${droppedFile.name}`);
                    return false;
                } else if (!txHash) {
                    let errorMessage = sdkError instanceof Error ? sdkError.message : 'Upload failed.';
                    try {
                        const parsed = JSON.parse(errorMessage);
                        if (parsed?.message) errorMessage = parsed.message;
                        else if (parsed?.error) errorMessage = parsed.error;
                    } catch (e) { /* Not JSON */ }

                    if (errorMessage.toLowerCase().includes('not yet been marked successfully written')) {
                        errorMessage = 'File is being processed by the network. Check your Dashboard in a few minutes.';
                    }
                    toast.error(`${droppedFile.name}: ${errorMessage}`);
                    return false;
                } else {
                    console.warn(`Spurious error ignored for ${droppedFile.name}. txHash: ${txHash}`, sdkError);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 2000));

            window.dispatchEvent(new CustomEvent('vault:uploadSuccess', {
                detail: {
                    name: droppedFile.name,
                    size: droppedFile.size,
                    txHash: txHash,
                    timestamp: Date.now()
                }
            }));

            if (refetch) refetch();
            return true;

        } catch (error) {
            let errorMessage = error instanceof Error ? error.message : 'Upload failed.';
            try {
                const parsed = JSON.parse(errorMessage);
                if (parsed?.message) errorMessage = parsed.message;
            } catch (e) { /* Not JSON */ }
            toast.error(`${droppedFile.name}: ${errorMessage}`);
            return false;
        }
    };

    const startUploadQueue = async (files: File[]) => {
        if (!account) {
            toast.error("Please connect your Aptos wallet first!");
            return;
        }
        if (files.length === 0) return;

        setQueue(files);
        setSuccessCount(0);
        setFailCount(0);
        setCurrentIndex(0);
        setUploadState('uploading');
        setUploadStatusText("Awaiting wallet signature...");

        const cryptoKey = await ensureKey();
        if (!cryptoKey) {
            setUploadState('idle');
            return;
        }

        let successes = 0;
        let failures = 0;

        for (let i = 0; i < files.length; i++) {
            setUploadStatusText("Awaiting wallet signature...");
            const ok = await uploadSingleFile(files[i], cryptoKey, i, files.length);
            if (ok) successes++;
            else failures++;
        }

        setSuccessCount(successes);
        setFailCount(failures);

        if (successes > 0) {
            toast.success(`${successes} file${successes > 1 ? 's' : ''} uploaded successfully!`);
        }

        setUploadState('success');

        // Clean up preview
        setPreviewUrl(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });
        setCurrentFile(null);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            startUploadQueue(Array.from(e.dataTransfer.files));
        }
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            startUploadQueue(Array.from(e.target.files));
        }
    };

    const resetTarget = () => {
        setQueue([]);
        setCurrentFile(null);
        setCurrentIndex(0);
        setSuccessCount(0);
        setFailCount(0);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setUploadState('idle');
        setUploadStatusText("Encrypting and distributing to nodes...");
        setLastTxHash(null);
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

    return (
        <section id="vault" className="py-20 md:py-24 relative z-10 px-6">
            <div className="container mx-auto max-w-4xl text-center mb-8 md:mb-12">
                <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white tracking-tight">The Storage Vault</h2>
                <p className="text-color-support/70 text-base md:text-xl font-light max-w-2xl mx-auto">Drag &amp; drop your digital assets to encrypt and fracture them across the global network.</p>
            </div>

            <div className="container mx-auto max-w-3xl relative">
                <GlassCard
                    className={`transition-all duration-500 overflow-hidden relative bg-[#111827]/80 backdrop-blur-2xl hover:scale-[1.02] hover:-translate-y-2 hover:shadow-[0_20px_60px_rgba(251,179,204,0.3)] ${isDragging ? 'border-color-primary shadow-[0_0_50px_rgba(251,179,204,0.3)] bg-color-primary/10 scale-[1.03]' : 'border-white/10'
                        }`}
                >
                    <div
                        ref={dropzoneRef}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className="w-full min-h-[350px] md:min-h-[450px] flex flex-col items-center justify-center p-6 md:p-12 border-2 border-dashed border-transparent relative z-10 transition-colors"
                        style={{ borderColor: isDragging ? 'rgba(251, 179, 204, 0.5)' : 'rgba(255, 255, 255, 0.15)' }}
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
                            <div className="flex flex-col items-center text-center w-full px-4">
                                <div ref={iconRef} className="w-20 h-20 md:w-24 md:h-24 rounded-full glass-panel flex items-center justify-center mb-6 text-color-primary bg-[#1A0D12] shadow-[0_0_30px_rgba(251,179,204,0.2)]">
                                    <UploadCloud size={40} strokeWidth={1.5} className="md:hidden text-color-accent" />
                                    <UploadCloud size={48} strokeWidth={1.5} className="hidden md:block text-color-accent" />
                                </div>
                                <h3 className="text-2xl md:text-3xl font-semibold mb-3 text-white tracking-tight">Deploy Assets</h3>
                                <p className="text-color-support/70 mb-2 text-sm md:text-lg">Drag &amp; drop or tap to browse</p>
                                <p className="text-color-support/40 mb-8 text-xs font-mono tracking-tighter uppercase">Images • Videos • Documents</p>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="mt-4 px-10 py-4 rounded-full bg-color-accent/20 border border-color-accent/40 text-white transition-all duration-700 font-bold shadow-lg shadow-[0_0_20px_rgba(232,58,118,0.2)] hover:bg-color-accent hover:scale-110 hover:shadow-[0_0_35px_rgba(232,58,118,0.5)] animate-glow-activate w-full sm:w-auto uppercase text-xs tracking-widest"
                                >
                                    Select Files
                                </button>
                            </div>
                        )}

                        {/* Uploading state */}
                        {uploadState === 'uploading' && currentFile && (
                            <div className="w-full max-w-lg flex flex-col items-center">
                                {renderPreview()}

                                {/* File name */}
                                <h3 className="text-xl font-medium mb-1 w-full text-center text-white break-all">{currentFile.name}</h3>

                                {/* File X of N indicator */}
                                {totalFiles > 1 && (
                                    <p className="text-color-primary/80 text-xs font-bold uppercase tracking-widest mb-2">
                                        File {currentIndex + 1} of {totalFiles}
                                    </p>
                                )}

                                <p className="text-color-support text-sm mb-8 text-center w-full">{uploadStatusText}</p>

                                <div className="w-full h-3 bg-black/50 rounded-full overflow-hidden border border-white/10">
                                    <div ref={progressRef} className="h-full w-0 bg-gradient-to-r from-color-primary to-color-accent shadow-[0_0_10px_rgba(232,58,118,0.8)]" />
                                </div>

                                {/* Overall progress dots for multi-file */}
                                {totalFiles > 1 && (
                                    <div className="flex gap-2 mt-4">
                                        {queue.map((_, i) => (
                                            <div
                                                key={i}
                                                className={`w-2 h-2 rounded-full transition-all duration-300 ${i < currentIndex
                                                        ? 'bg-green-400'
                                                        : i === currentIndex
                                                            ? 'bg-color-primary animate-pulse'
                                                            : 'bg-white/20'
                                                    }`}
                                            />
                                        ))}
                                    </div>
                                )}
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
                                    {successCount} Asset{successCount !== 1 ? 's' : ''} Secured
                                </h3>
                                {failCount > 0 && (
                                    <div className="flex items-center gap-2 text-red-400 text-[10px] md:text-sm mb-2">
                                        <AlertCircle size={12} className="md:w-3.5 md:h-3.5" />
                                        <span>{failCount} file{failCount !== 1 ? 's' : ''} failed</span>
                                    </div>
                                )}
                                <p className="text-color-support text-xs md:text-lg mb-6 max-w-xs mx-auto">
                                    {successCount > 0 ? 'Your files are now immutably stored on the soobinvault network.' : 'No files were uploaded successfully.'}
                                </p>

                                {lastTxHash && (
                                    <a
                                        href={`https://explorer.aptoslabs.com/txn/${lastTxHash}?network=testnet`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mb-6 md:mb-8 px-5 md:px-6 py-2 rounded-xl bg-color-primary/10 border border-color-primary/20 text-color-primary hover:bg-color-primary/20 transition-all flex items-center gap-2 font-mono text-[10px] md:text-xs"
                                    >
                                        <LinkIcon size={12} className="md:w-3.5 md:h-3.5" />
                                        <span>Last tx: {lastTxHash.substring(0, 6)}...{lastTxHash.substring(lastTxHash.length - 6)}</span>
                                    </a>
                                )}

                                <button
                                    onClick={resetTarget}
                                    className="w-full sm:w-auto px-8 py-3.5 md:py-4 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 text-white transition-colors font-medium backdrop-blur-md text-sm md:text-base uppercase tracking-widest"
                                >
                                    Store More Assets
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
