"use client";

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Lock, FileText, Image as ImageIcon, Database, Link as LinkIcon, Download, PackageOpen } from 'lucide-react';
import { GlassCard } from './ui/GlassCard';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useShelbyClient } from "@shelby-protocol/react";
import { useState } from 'react';
import { LinkPreviewModal } from './LinkPreviewModal';

// ... (existing code)

export function Dashboard() {
    const containerRef = useRef<HTMLDivElement>(null);
    const { account } = useWallet();
    const shelbyClient = useShelbyClient();
    const [assets, setAssets] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    
    // Modal State
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState<{
        name: string;
        url: string;
        sizeStr: string;
        isImage: boolean;
    } | null>(null);

    const fetchBlobs = async () => {
        if (!account) return;
        setIsLoading(true);
        try {
            const blobs = await shelbyClient.coordination.getAccountBlobs({
                account: account.address.toString(),
            });
            setAssets(blobs || []);
        } catch (error) {
            console.error("Failed to fetch blobs", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!account) {
            setAssets([]);
            return;
        }

        fetchBlobs();

        // Listen for successful uploads from VaultDropzone
        const handleUploadSuccess = () => fetchBlobs();
        window.addEventListener('vault:uploadSuccess', handleUploadSuccess);
        return () => window.removeEventListener('vault:uploadSuccess', handleUploadSuccess);
    }, [account, shelbyClient]);

    useEffect(() => {
        const ctx = gsap.context(() => {
            gsap.fromTo(".dash-stat",
                { y: 50, opacity: 0 },
                {
                    scrollTrigger: {
                        trigger: containerRef.current,
                        start: "top 80%",
                    },
                    y: 0,
                    opacity: 1,
                    stagger: 0.1,
                    duration: 0.8,
                    ease: "power3.out"
                });

            // Protocol animation moved to Protocol.tsx
        }, containerRef);

        return () => ctx.revert();
    }, []);

    useEffect(() => {
        if (!assets || assets.length === 0) return;

        const ctx = gsap.context(() => {
            gsap.fromTo(".asset-row",
                { x: -50, opacity: 0 },
                {
                    scrollTrigger: {
                        trigger: ".assets-container",
                        start: "top 85%",
                    },
                    x: 0,
                    opacity: 1,
                    stagger: 0.08,
                    duration: 0.6,
                    ease: "power2.out"
                });
        }, containerRef);

        return () => ctx.revert();
    }, [assets]);

    return (
        <section ref={containerRef} id="dashboard" className="py-24 relative z-10 px-6 mt-12 mb-32">
            <div className="container mx-auto max-w-6xl">

                <div className="flex flex-col md:flex-row justify-between items-end mb-12 border-b border-white/10 pb-6">
                    <div>
                        <h2 className="text-4xl md:text-5xl font-bold mb-3 text-white">Your Vault</h2>
                        <p className="text-color-support text-lg">Manage your distributed assets</p>
                    </div>
                    <div className="mt-8 md:mt-0 flex flex-wrap gap-4">
                        <div className="dash-stat px-6 py-4 rounded-2xl glass-panel bg-[#0A0A0A]/80 border-white/5 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#FBB3CC]/30 to-transparent" />
                            <span className="text-xs text-color-support/50 uppercase tracking-widest font-semibold block mb-2">Total Stored</span>
                            <span className="text-2xl font-mono text-white tracking-tight group-hover:text-[#FBB3CC] transition-colors">14.8 <span className="text-sm font-sans text-color-support/40">GB</span></span>
                        </div>
                        <div className="dash-stat px-6 py-4 rounded-2xl glass-panel bg-[#0A0A0A]/80 border-white/5 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#E83A76]/30 to-transparent" />
                            <span className="text-xs text-color-support/50 uppercase tracking-widest font-semibold block mb-2">Network Nodes</span>
                            <span className="text-2xl font-mono text-white tracking-tight group-hover:text-[#E83A76] transition-colors">128 <span className="text-sm font-sans text-color-support/40">Active</span></span>
                        </div>
                    </div>
                </div>



                <GlassCard className="assets-container p-0 overflow-hidden border-white/5 bg-[#050505]/90 backdrop-blur-3xl rounded-3xl">
                    {/* Table Header */}
                    <div className="hidden md:grid grid-cols-12 gap-4 p-5 border-b border-white/5 text-color-support/40 text-xs font-semibold uppercase tracking-widest bg-[#0A0A0A]">
                        <div className="col-span-5">Asset Name</div>
                        <div className="col-span-2">Size</div>
                        <div className="col-span-2">Uploaded</div>
                        <div className="col-span-2">Status</div>
                        <div className="col-span-1 text-right">Actions</div>
                    </div>

                    {/* Asset Rows */}
                    <div className="divide-y divide-white/5 min-h-[200px]">
                        {!account ? (
                            <div className="p-12 text-center text-color-support/60 flex flex-col items-center">
                                <Lock size={48} className="mb-4 opacity-50" />
                                <p>Connect your Petra Wallet to view your secure Vault.</p>
                            </div>
                        ) : isLoading ? (
                            <div className="p-12 text-center text-color-support flex flex-col items-center">
                                <div className="w-8 h-8 rounded-full border-t-2 border-b-2 border-color-primary animate-spin mb-4" />
                                <p>Decrypting records and fetching from network nodes...</p>
                            </div>
                        ) : assets.length === 0 ? (
                            <div className="p-16 text-center flex flex-col items-center justify-center bg-[#0A0A0A]/50 m-4 rounded-2xl border border-white/5 shadow-inner">
                                <div className="w-20 h-20 rounded-full bg-color-primary/10 flex items-center justify-center mb-6">
                                    <PackageOpen size={40} className="text-color-primary opacity-80" />
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-2">Your Vault is Empty</h3>
                                <p className="text-gray-400 mb-8 max-w-sm">Start uploading your first file to secure it on Shelby Network</p>
                                <button
                                    onClick={() => document.getElementById('vault')?.scrollIntoView({ behavior: 'smooth' })}
                                    className="px-8 py-3 rounded-full bg-gradient-to-r from-color-primary to-color-accent text-white font-medium hover:scale-105 transition-transform shadow-[0_0_20px_rgba(232,58,118,0.4)]"
                                >
                                    Upload Now
                                </button>
                            </div>
                        ) : (
                            assets.map((asset, index) => {
                                // blobNameSuffix is the clean filename (e.g. "photo.png").
                                // asset.name is the full blob key (@address/photo.png) — don't display that.
                                const displayName: string =
                                    asset.blobNameSuffix ||
                                    (typeof asset.name === 'string' ? asset.name.replace(/^@[^/]+\//, '') : asset.name);
                                const sizeMB = (asset.size / (1024 * 1024)).toFixed(2);
                                const isImg = !!displayName.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);
                                const downloadUrl = `https://api.testnet.shelby.xyz/shelby/v1/blobs/${account?.address}/${displayName}`;

                                const handleOpenPreview = () => {
                                    setSelectedAsset({
                                        name: displayName,
                                        url: downloadUrl,
                                        sizeStr: sizeMB,
                                        isImage: isImg
                                    });
                                    setIsPreviewModalOpen(true);
                                };

                                return (
                                    <div 
                                        key={asset.blob_merkle_root || index} 
                                        className="asset-row grid grid-cols-1 md:grid-cols-12 gap-4 p-6 items-center hover:bg-white/5 transition-all duration-300 group cursor-pointer relative overflow-hidden"
                                        onClick={handleOpenPreview}
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-color-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                                        <div className="col-span-1 md:col-span-5 flex items-center gap-4 relative z-10">
                                            <div className="w-10 h-10 rounded-lg glass-panel bg-[#0A0A0A] flex items-center justify-center shadow-inner group-hover:scale-110 group-hover:bg-[#111] transition-all duration-300 border border-white/5">
                                                {isImg ? <ImageIcon className="text-color-accent" size={18} /> : <FileText className="text-color-support/70" size={18} />}
                                            </div>
                                            <span className="font-mono text-sm text-white/80 group-hover:text-white truncate transition-colors">{displayName}</span>
                                        </div>

                                        <div className="col-span-1 md:col-span-2 text-color-support/60 font-mono text-sm group-hover:text-color-support transition-colors relative z-10">
                                            <span className="md:hidden text-color-support/30 mr-2 font-sans text-xs uppercase tracking-widest">Size:</span>
                                            {sizeMB} <span className="text-xs text-color-support/40 font-sans">MB</span>
                                        </div>

                                        <div className="col-span-1 md:col-span-2 text-color-support/50 font-mono text-sm group-hover:text-color-support transition-colors relative z-10 flex items-center">
                                            <span className="md:hidden text-color-support/30 mr-2 font-sans text-xs uppercase tracking-widest">Hash:</span>
                                            {asset.blob_merkle_root ? `${asset.blob_merkle_root.slice(0, 10)}...` : '...'}
                                        </div>

                                        <div className="col-span-1 md:col-span-2 flex items-center gap-2 relative z-10">
                                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 group-hover:border-green-500/40 transition-colors">
                                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                                                <span className="text-[10px] uppercase tracking-widest font-semibold">
                                                    Secured
                                                </span>
                                            </div>
                                        </div>

                                        <div className="col-span-1 md:col-span-1 flex items-center justify-end gap-2 mt-4 md:mt-0 relative z-10 opacity-50 group-hover:opacity-100 transition-opacity">
                                            <button
                                                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-color-support hover:text-white transition-all hover:scale-110"
                                                title="Copy Link"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenPreview();
                                                }}
                                            >
                                                <LinkIcon size={16} />
                                            </button>
                                            <button
                                                className="p-2 rounded-lg bg-color-primary/10 hover:bg-color-primary/20 text-color-primary hover:text-white transition-all hover:scale-110"
                                                title="Download"
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    try {
                                                        const response = await fetch(downloadUrl);
                                                        const fileData = await response.blob();
                                                        const downloadLink = document.createElement("a");
                                                        downloadLink.href = URL.createObjectURL(fileData);
                                                        downloadLink.download = displayName;
                                                        downloadLink.click();
                                                    } catch (err) {
                                                        alert("Failed to download or decrypt asset");
                                                    }
                                                }}
                                            >
                                                <Download size={16} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Pagination / Footer */}
                    <div className="p-6 border-t border-white/5 flex justify-between items-center bg-black/30">
                        <span className="text-sm text-color-support/50 font-medium">Viewing secure assets on the decentralized network.</span>
                        <span className="text-xs font-mono text-white/30 tracking-widest">
                            Connection mode: {process.env.NEXT_PUBLIC_SHELBY_API_KEY ? 'Secure' : 'Public/Limited'}
                        </span>
                    </div>
                </GlassCard>

            </div>

            {/* Link Preview Modal */}
            <LinkPreviewModal 
                isOpen={isPreviewModalOpen}
                onClose={() => setIsPreviewModalOpen(false)}
                assetName={selectedAsset?.name || ''}
                assetUrl={selectedAsset?.url || null}
                assetSizeStr={selectedAsset?.sizeStr || '0'}
                isImage={selectedAsset?.isImage || false}
                onDownload={async () => {
                    if (selectedAsset) {
                         try {
                             const response = await fetch(selectedAsset.url);
                             const fileData = await response.blob();
                             const downloadLink = document.createElement("a");
                             downloadLink.href = URL.createObjectURL(fileData);
                             downloadLink.download = selectedAsset.name;
                             downloadLink.click();
                         } catch (err) {
                             alert("Failed to download or decrypt asset");
                         }
                    }
                }}
            />
        </section>
    );
}
