"use client";

import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, File as FileIcon, CheckCircle, Image as ImageIcon } from 'lucide-react';
import gsap from 'gsap';
import { GlassCard } from './ui/GlassCard';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import { useUploadBlobs } from "@shelby-protocol/react";
import { ShelbyClient } from "@shelby-protocol/sdk/browser";

export function VaultDropzone() {
    const { account, signAndSubmitTransaction } = useWallet();
    const [isDragging, setIsDragging] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'success'>('idle');
    const [uploadStatusText, setUploadStatusText] = useState<string>("Encrypting and distributing to nodes...");
    
    const shelbyClient = React.useMemo(() => new ShelbyClient({
        network: Network.TESTNET,
        apiKey: process.env.NEXT_PUBLIC_SHELBY_API_KEY,
    }), []);

    const uploadBlobs = useUploadBlobs({ client: shelbyClient });

    const dropzoneRef = useRef<HTMLDivElement>(null);
    const iconRef = useRef<HTMLDivElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!iconRef.current) return;

        if (isDragging) {
            gsap.to(iconRef.current, {
                scale: 1.2,
                y: -10,
                duration: 0.4,
                ease: "back.out(1.7, 0.3)"
            });
        } else {
            gsap.to(iconRef.current, {
                scale: 1,
                y: 0,
                duration: 0.4,
                ease: "power2.out"
            });
        }
    }, [isDragging]);

    useEffect(() => {
        if (uploadState === 'uploading' && progressRef.current) {
            // Indeterminate loading animation
            const anim = gsap.fromTo(progressRef.current,
                { x: "-100%", width: "50%" },
                { x: "200%", duration: 1.5, repeat: -1, ease: "power1.inOut" }
            );
            return () => { anim.kill(); };
        }
    }, [uploadState]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const uploadToShelby = async (droppedFile: File) => {
        if (!account) {
            alert("Please connect your Petra wallet first!");
            return;
        }

        setFile(droppedFile);

        // Create preview if image
        if (droppedFile.type.startsWith('image/')) {
            const url = URL.createObjectURL(droppedFile);
            setPreviewUrl(url);
        } else {
            setPreviewUrl(null);
        }

        try {
            setUploadState('uploading');
            setUploadStatusText("Encrypting and distributing to nodes...");

            const arrayBuffer = await droppedFile.arrayBuffer();
            const fileData = new Uint8Array(arrayBuffer);

            uploadBlobs.mutate({
                signer: { 
                    account: account.address as any, 
                    signAndSubmitTransaction 
                },
                blobs: [{ blobName: droppedFile.name, blobData: fileData }],
                expirationMicros: Date.now() * 1000 + 86400000000 * 30, // 30 days
            }, {
                onSuccess: () => {
                    setUploadState('success');
                },
                onError: (error) => {
                    console.error("Upload failed:", error);
                    alert("Upload failed. Please check the console logs and ensure you have ShelbyUSD testnet tokens.");
                    setUploadState('idle');
                }
            });

        } catch (error) {
            console.error("Upload preparation failed:", error);
            alert("Upload preparation failed.");
            setUploadState('idle');
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            uploadToShelby(e.dataTransfer.files[0]);
        }
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            uploadToShelby(e.target.files[0]);
        }
    };

    const resetTarget = () => {
        setFile(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setUploadState('idle');
        setUploadStatusText("Encrypting and distributing to nodes...");
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    return (
        <section id="vault" className="py-24 relative z-10 px-6">
            <div className="container mx-auto max-w-4xl text-center mb-12">
                <h2 className="text-4xl md:text-5xl font-bold mb-4 text-white">The Storage Vault</h2>
                <p className="text-color-support text-xl font-light">Drag and drop your digital assets to encrypt and fracture them across the network.</p>
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
                        className="w-full h-96 flex flex-col items-center justify-center p-8 border-2 border-dashed border-transparent relative z-10 transition-colors"
                        style={{ borderColor: isDragging ? 'rgba(251, 179, 204, 0.5)' : 'rgba(255, 255, 255, 0.15)' }}
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileInput}
                            className="hidden"
                        />

                        {uploadState === 'idle' && (
                            <div className="flex flex-col items-center text-center">
                                <div ref={iconRef} className="w-24 h-24 rounded-full glass-panel flex items-center justify-center mb-6 text-color-primary bg-[#1A0D12] shadow-[0_0_30px_rgba(251,179,204,0.2)]">
                                    <UploadCloud size={48} strokeWidth={1.5} className="text-color-accent" />
                                </div>
                                <h3 className="text-3xl font-semibold mb-3 text-white">Initialize Storage Protocol</h3>
                                <p className="text-color-support mb-8 text-lg">Drag and drop any file here, or click to browse</p>

                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="px-8 py-4 rounded-full bg-color-accent hover:bg-[#FBB3CC] hover:text-[#1A0D12] text-white transition-colors font-medium shadow-lg hover:shadow-[0_0_20px_rgba(232,58,118,0.5)]"
                                >
                                    Select File
                                </button>
                            </div>
                        )}

                        {uploadState === 'uploading' && file && (
                            <div className="w-full max-w-lg flex flex-col items-center">
                                {previewUrl ? (
                                    <div className="w-32 h-32 mb-6 rounded-xl overflow-hidden border border-white/20 shadow-2xl relative">
                                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-color-primary/20 animate-pulse mix-blend-overlay" />
                                    </div>
                                ) : (
                                    <div className="w-20 h-20 rounded-2xl glass-panel flex items-center justify-center mb-6 text-color-accent animate-pulse bg-color-deep">
                                        <FileIcon size={40} />
                                    </div>
                                )}
                                <h3 className="text-2xl font-medium mb-2 w-full text-center text-white break-all">{file.name}</h3>
                                <p className="text-color-support text-base mb-8">Encrypting and distributing to nodes...</p>

                                <div className="w-full h-3 bg-black/50 rounded-full overflow-hidden border border-white/10">
                                    <div ref={progressRef} className="h-full w-0 bg-gradient-to-r from-color-primary to-color-accent shadow-[0_0_10px_rgba(232,58,118,0.8)]" />
                                </div>
                            </div>
                        )}

                        {uploadState === 'success' && (
                            <div className="flex flex-col items-center">
                                <div className="w-24 h-24 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mb-6 text-green-400 shadow-[0_0_30px_rgba(74,222,128,0.2)]">
                                    <CheckCircle size={48} strokeWidth={2} />
                                </div>
                                <h3 className="text-3xl font-semibold mb-3 text-white">Asset Secured</h3>
                                <p className="text-color-support text-lg mb-8">Your file is now immutably stored on the shoobinvault network.</p>
                                <button
                                    onClick={resetTarget}
                                    className="px-8 py-4 rounded-full bg-white/10 border border-white/20 hover:bg-white/20 text-white transition-colors font-medium backdrop-blur-md"
                                >
                                    Store Another Asset
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
