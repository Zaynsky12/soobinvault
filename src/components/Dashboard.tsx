"use client";

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Lock, FileText, Image as ImageIcon, Database, Link as LinkIcon, Download, PackageOpen, Loader2, CheckCircle2, Clock } from 'lucide-react';
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

                <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 border-b border-white/5 pb-8">
                    <div className="mb-8 md:mb-0">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-color-primary/10 border border-color-primary/20 mb-4">
                            <span className="w-2 h-2 rounded-full bg-color-primary animate-pulse" />
                            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-color-primary">Vault Protocol Active</span>
                        </div>
                        <h2 className="text-5xl md:text-6xl font-bold mb-4 text-white tracking-tight">Your Vault</h2>
                        <p className="text-color-support/60 text-lg font-light max-w-md">Orchestrate and monitor your distributed assets across the decentralized infrastructure.</p>
                    </div>
                    <div className="w-full md:w-auto flex flex-wrap gap-4">
                        <div className="dash-stat flex-1 md:flex-none min-w-[140px] px-6 py-5 rounded-2xl glass-panel bg-[#0A0A0A]/40 border-white/5 relative overflow-hidden group hover:border-color-primary/30 transition-all duration-500">
                            <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-r from-transparent via-color-primary/20 to-transparent" />
                            <span className="text-[10px] text-color-support/40 uppercase tracking-[0.2em] font-bold block mb-3">Total Assets</span>
                            <span className="text-3xl font-mono text-white tracking-tighter group-hover:text-color-primary transition-colors">{isLoading ? "..." : assets.length}</span>
                        </div>
                        <div className="dash-stat flex-1 md:flex-none min-w-[140px] px-6 py-5 rounded-2xl glass-panel bg-[#0A0A0A]/40 border-white/5 relative overflow-hidden group hover:border-color-accent/30 transition-all duration-500">
                            <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-r from-transparent via-color-accent/20 to-transparent" />
                            <span className="text-[10px] text-color-support/40 uppercase tracking-[0.2em] font-bold block mb-3">Active Syncs</span>
                            <span className="text-3xl font-mono text-white tracking-tighter group-hover:text-color-accent transition-colors">
                                {assets.filter(a => a.status === 'syncing' || a.status === 'checking').length || 0}
                            </span>
                        </div>
                        <div className="dash-stat flex-1 md:flex-none min-w-[140px] px-6 py-5 rounded-2xl glass-panel bg-[#0A0A0A]/40 border-white/5 relative overflow-hidden group hover:border-white/20 transition-all duration-500">
                            <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                            <span className="text-[10px] text-color-support/40 uppercase tracking-[0.2em] font-bold block mb-3">Node Capacity</span>
                            <span className="text-3xl font-mono text-white tracking-tighter group-hover:text-white transition-colors">99.9<span className="text-xs font-sans text-color-support/30">%</span></span>
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
                            <div className="p-20 text-center flex flex-col items-center justify-center bg-[#050505] m-6 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-color-primary/5 via-transparent to-color-accent/5" />
                                <div className="relative z-10">
                                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-color-primary/20 to-color-accent/20 flex items-center justify-center mb-8 mx-auto shadow-[0_0_40px_rgba(232,58,118,0.1)] border border-white/10 group">
                                        <PackageOpen size={48} className="text-color-primary animate-pulse" />
                                    </div>
                                    <h3 className="text-3xl font-bold text-white mb-4 tracking-tight">Vault Protocol Initialized</h3>
                                    <p className="text-color-support/60 mb-10 max-w-sm mx-auto font-light leading-relaxed text-lg">
                                        Your secure environment is ready, but no assets have been provisioned yet.
                                    </p>
                                    <button
                                        onClick={() => window.location.href = '/vault'}
                                        className="px-10 py-4 rounded-2xl bg-gradient-to-r from-color-primary to-color-accent text-white font-bold uppercase tracking-widest text-xs hover:scale-105 transition-all shadow-[0_0_30px_rgba(232,58,118,0.3)] hover:shadow-[0_0_50px_rgba(232,58,118,0.5)]"
                                    >
                                        Deploy First Asset
                                    </button>
                                </div>
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
                                const downloadUrl = `https://api.testnet.shelby.xyz/shelby/v1/blobs/${encodeURIComponent(account?.address?.toString() || '')}/${encodeURIComponent(displayName)}`;

                                const handleOpenPreview = () => {
                                    setSelectedAsset({
                                        name: displayName,
                                        url: downloadUrl,
                                        sizeStr: sizeMB,
                                        isImage: isImg
                                    });
                                    setIsPreviewModalOpen(true);
                                };
                                 const handleDownload = async (e?: React.MouseEvent) => {
                                    if (e) e.stopPropagation();
                                    const apiKey = process.env.NEXT_PUBLIC_SHELBY_API_KEY || "aptoslabs_hgdBXnSK14t_6GHbXm2irnCgggVW6KNMWogb1qcygNFwS";
                                    try {
                                        const response = await fetch(downloadUrl, {
                                            headers: {
                                                'Authorization': `Bearer ${apiKey.trim()}`
                                            }
                                        });
                                        
                                        if (!response.ok) {
                                            let errorDetail = `Server returned ${response.status}`;
                                            try {
                                                const errorData = await response.json();
                                                errorDetail += `: ${errorData.message || errorData.error || response.statusText}`;
                                            } catch (e) {
                                                errorDetail += `: ${response.statusText}`;
                                            }
                                            throw new Error(errorDetail);
                                        }

                                        const fileData = await response.blob();
                                        const downloadLink = document.createElement("a");
                                        const url = URL.createObjectURL(fileData);
                                        downloadLink.href = url;
                                        downloadLink.download = displayName;
                                        downloadLink.click();
                                        setTimeout(() => URL.revokeObjectURL(url), 100);
                                    } catch (err) {
                                        console.error("Download failed", err);
                                        alert(`Failed to download asset: ${err instanceof Error ? err.message : 'Unknown error'}`);
                                    }
                                };

                                return (
                                    <AssetRow 
                                        key={asset.blob_merkle_root || index}
                                        asset={asset}
                                        index={index}
                                        displayName={displayName}
                                        sizeMB={sizeMB}
                                        isImg={isImg}
                                        downloadUrl={downloadUrl}
                                        handleOpenPreview={handleOpenPreview}
                                    />
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
                         const apiKey = process.env.NEXT_PUBLIC_SHELBY_API_KEY || "aptoslabs_hgdBXnSK14t_6GHbXm2irnCgggVW6KNMWogb1qcygNFwS";
                         try {
                             const response = await fetch(selectedAsset.url, {
                                 headers: {
                                     'Authorization': `Bearer ${apiKey.trim()}`
                                 }
                             });
                             
                             if (!response.ok) {
                                 const contentType = response.headers.get('content-type');
                                 let errorDetail = "";
                                 if (contentType && contentType.includes('application/json')) {
                                     try {
                                         const errorData = await response.json();
                                         if (errorData.error && errorData.error.toLowerCase().includes('not yet been marked successfully written')) {
                                             errorDetail = "This file is still being indexed on the Shelby network. Please wait a few moments and try again.";
                                         } else {
                                             errorDetail = errorData.message || errorData.error || response.statusText;
                                         }
                                     } catch (e) {
                                         errorDetail = response.statusText;
                                     }
                                 } else {
                                     errorDetail = response.statusText;
                                 }
                                 throw new Error(errorDetail || `Server returned ${response.status}`);
                             }

                             const fileData = await response.blob();
                             const downloadLink = document.createElement("a");
                             const url = URL.createObjectURL(fileData);
                             downloadLink.href = url;
                             downloadLink.download = selectedAsset.name;
                             downloadLink.click();
                             setTimeout(() => URL.revokeObjectURL(url), 100);
                         } catch (err) {
                             console.error("Download failed", err);
                             alert(`${err instanceof Error ? err.message : 'An unexpected error occurred during download'}`);
                         }
                    }
                }}
            />
        </section>
    );
}

function AssetRow({ asset, index, displayName, sizeMB, isImg, downloadUrl, handleOpenPreview }: any) {
    const [status, setStatus] = useState<'checking' | 'syncing' | 'live'>('checking');
    
    useEffect(() => {
        const checkStatus = async () => {
            const apiKey = process.env.NEXT_PUBLIC_SHELBY_API_KEY || "aptoslabs_hgdBXnSK14t_6GHbXm2irnCgggVW6KNMWogb1qcygNFwS";
            try {
                // Check if the blob is available
                const response = await fetch(downloadUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKey.trim()}`,
                        'Range': 'bytes=0-0'
                    }
                });

                if (response.ok) {
                    setStatus('live');
                } else if (response.status === 404 || response.status === 500) {
                    const contentType = response.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        const data = await response.json();
                        if (data.error && data.error.toLowerCase().includes('not yet been marked successfully written')) {
                            setStatus('syncing');
                        } else {
                            setStatus('live');
                        }
                    } else {
                        setStatus('live');
                    }
                } else {
                    setStatus('live');
                }
            } catch (e) {
                setStatus('live');
            }
        };

        checkStatus();
    }, [downloadUrl]);

    const handleDownload = async (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        const apiKey = process.env.NEXT_PUBLIC_SHELBY_API_KEY || "aptoslabs_hgdBXnSK14t_6GHbXm2irnCgggVW6KNMWogb1qcygNFwS";
        try {
            const response = await fetch(downloadUrl, {
                headers: {
                    'Authorization': `Bearer ${apiKey.trim()}`
                }
            });
            
            if (!response.ok) {
                const contentType = response.headers.get('content-type');
                let errorDetail = "";
                if (contentType && contentType.includes('application/json')) {
                    try {
                        const errorData = await response.json();
                        if (errorData.error && errorData.error.toLowerCase().includes('not yet been marked successfully written')) {
                            errorDetail = "This file is still being indexed on the Shelby network. Please wait a few moments and try again.";
                        } else {
                            errorDetail = errorData.message || errorData.error || response.statusText;
                        }
                    } catch (e) {
                        errorDetail = response.statusText;
                    }
                } else {
                    errorDetail = response.statusText;
                }
                throw new Error(errorDetail || `Server returned ${response.status}`);
            }

            const fileData = await response.blob();
            const downloadLink = document.createElement("a");
            const url = URL.createObjectURL(fileData);
            downloadLink.href = url;
            downloadLink.download = displayName;
            downloadLink.click();
            setTimeout(() => URL.revokeObjectURL(url), 100);
        } catch (err) {
            console.error("Download failed", err);
            alert(`${err instanceof Error ? err.message : 'An unexpected error occurred during download'}`);
        }
    };

    return (
        <div 
            className={`asset-row flex flex-col md:grid md:grid-cols-12 gap-4 p-5 md:p-6 items-center transition-all duration-500 relative overflow-hidden border-b border-white/5 last:border-0 ${status === 'live' ? 'hover:bg-white/[0.03] cursor-pointer group' : 'opacity-60 cursor-not-allowed'}`}
            onClick={status === 'live' ? handleOpenPreview : undefined}
        >
            {/* Hover Background Artifact */}
            <div className="absolute inset-0 bg-gradient-to-r from-color-primary/[0.03] via-transparent to-color-accent/[0.03] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            {/* Asset Identity (Mobile Header) */}
            <div className="w-full col-span-12 lg:col-span-5 flex items-center justify-between md:justify-start gap-4 relative z-10">
                <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-xl glass-panel bg-[#050505] flex items-center justify-center shadow-2xl group-hover:scale-110 group-hover:border-color-primary/30 transition-all duration-500 border border-white/5 shrink-0">
                        {isImg ? (
                            <ImageIcon className="text-color-accent group-hover:text-white transition-colors" size={20} />
                        ) : (
                            <FileText className="text-color-support/60 group-hover:text-white transition-colors" size={20} />
                        )}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-white font-bold truncate text-base group-hover:text-color-primary transition-colors duration-300">{displayName}</span>
                        </div>
                        <span className="text-color-support/40 text-[10px] font-mono tracking-widest items-center flex gap-2">
                            <span className="w-1 h-1 rounded-full bg-color-primary/50" />
                            {asset.blob_merkle_root?.substring(0, 16)}...
                            <span className="hidden md:inline text-[9px] opacity-30">| BLOB_ID</span>
                        </span>
                    </div>
                </div>

                {/* Mobile-only Status */}
                <div className="md:hidden flex items-center gap-2">
                     {status === 'live' ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 text-[9px] font-bold uppercase tracking-widest border border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
                            <CheckCircle2 size={10} />
                            <span>Live</span>
                        </div>
                    ) : status === 'syncing' ? (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-color-primary/10 text-color-primary text-[9px] font-bold uppercase tracking-widest border border-color-primary/20 animate-pulse shadow-[0_0_15px_rgba(232,58,118,0.1)]">
                            <Clock size={10} />
                            <span>Syncing</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 text-color-support/30 text-[9px] font-bold uppercase tracking-widest border border-white/10">
                            <Loader2 size={10} className="animate-spin" />
                            <span>Check</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Capacity / Size (Desktop Only in Grid) */}
            <div className="hidden md:flex col-span-2 relative z-10 flex-col">
                <span className="text-[10px] text-color-support/30 font-bold uppercase tracking-[0.2em] mb-1">Capacity</span>
                <span className="text-white/80 font-mono text-xs tracking-widest">{sizeMB} MB</span>
            </div>

            {/* Time / Hash (Desktop Only) */}
            <div className="hidden md:flex col-span-2 text-color-support/50 font-mono text-xs tracking-widest relative z-10 flex-col">
                <span className="text-[10px] text-color-support/30 font-bold uppercase tracking-[0.2em] mb-1">Network Hash</span>
                <span className="group-hover:text-color-support transition-colors">
                    {asset.blob_merkle_root ? `${asset.blob_merkle_root.slice(0, 8)}...` : '...'}
                </span>
            </div>

            {/* Status (Desktop Only) */}
            <div className="hidden md:flex col-span-2 relative z-10">
                {status === 'live' ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-green-500/5 text-green-400 text-[10px] font-bold uppercase tracking-[0.15em] border border-green-500/10 group-hover:border-green-500/30 transition-all shadow-[0_0_20px_rgba(34,197,94,0.05)]">
                        <CheckCircle2 size={12} className="shrink-0" />
                        <span>Available</span>
                    </div>
                ) : status === 'syncing' ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-color-primary/5 text-color-primary text-[10px] font-bold uppercase tracking-[0.15em] border border-color-primary/10 animate-pulse shadow-[0_0_20px_rgba(232,58,118,0.05)]">
                        <Clock size={12} className="shrink-0" />
                        <span>Synchronizing</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] text-color-support/30 text-[10px] font-bold uppercase tracking-[0.15em] border border-white/5">
                        <Loader2 size={12} className="animate-spin shrink-0" />
                        <span>Verifying</span>
                    </div>
                )}
            </div>

            {/* Actions (Responsive) */}
            <div className="w-full md:w-auto md:col-span-1 flex justify-end items-center gap-3 relative z-10 mt-4 md:mt-0">
                <div className="flex items-center w-full md:w-auto bg-black/40 p-1.5 rounded-2xl border border-white/5 group-hover:border-color-primary/20 transition-all duration-500 shadow-2xl">
                    <button 
                        className="flex-grow md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-color-primary/10 hover:bg-color-primary text-color-primary hover:text-white transition-all duration-300 font-bold text-[10px] uppercase tracking-[0.2em] shadow-lg hover:shadow-color-primary/20"
                        onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(downloadUrl);
                            alert("Secure link copied to clipboard");
                        }}
                    >
                        <LinkIcon size={12} />
                        <span className="md:hidden lg:inline">Copy Secure Link</span>
                        <span className="hidden md:inline lg:hidden">Link</span>
                    </button>
                    
                    <div className="w-[1px] h-4 bg-white/10 mx-2 shrink-0" />
                    
                    <button
                        className={`p-2.5 rounded-xl transition-all shadow-lg ${status === 'live' ? 'bg-white/5 hover:bg-color-accent text-white hover:scale-110 hover:shadow-color-accent/30' : 'bg-white/5 text-color-support/20 cursor-not-allowed'}`}
                        title={status === 'live' ? "Download Payload" : "Indexing..."}
                        onClick={status === 'live' ? handleDownload : (e) => e.stopPropagation()}
                        disabled={status !== 'live'}
                    >
                        <Download size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
