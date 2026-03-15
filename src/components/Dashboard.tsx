"use client";

import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Lock, FileText, Image as ImageIcon, Database, Link as LinkIcon, Download, PackageOpen, Loader2, CheckCircle2, Clock, Search } from 'lucide-react';
import { GlassCard } from './ui/GlassCard';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useShelbyClient } from "@shelby-protocol/react";
import { LinkPreviewModal } from './LinkPreviewModal';

export function Dashboard() {
    const containerRef = useRef<HTMLDivElement>(null);
    const { account } = useWallet();
    const shelbyClient = useShelbyClient();
    const [assets, setAssets] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

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
            
            // Sort assets by descent order (latest first) based on common indexer fields
            const sortedBlobs = (blobs || []).sort((a: any, b: any) => {
                const timeA = a.indexed_at || a.block_timestamp || 0;
                const timeB = b.indexed_at || b.block_timestamp || 0;
                
                // If we have timestamps, sort by them; otherwise, we might rely on the original order
                if (timeA && timeB) return Number(timeB) - Number(timeA);
                
                // Fallback to reversed order if no explicit timestamps are found,
                // assuming the API returns them in ascending chronological order by default.
                return 0; 
            });

            // If no timestamps were found to sort by, and the list isn't empty, 
            // reverse it as a safe fallback for "newest first".
            if (sortedBlobs.length > 0 && !sortedBlobs[0].indexed_at && !sortedBlobs[0].block_timestamp) {
                setAssets([...sortedBlobs].reverse());
            } else {
                setAssets(sortedBlobs);
            }
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
                            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-color-primary">Vault Protocol Active</span>
                        </div>
                        <h2 className="text-5xl md:text-6xl font-bold mb-4 text-white tracking-tight leading-none">Your Vault</h2>
                        <p className="text-color-support/60 text-lg font-normal max-w-md leading-relaxed">Orchestrate and monitor your distributed assets across the decentralized infrastructure.</p>
                    </div>
                    
                    <div className="w-full md:w-auto flex flex-col sm:flex-row items-stretch md:items-end gap-3 md:gap-4">
                        <div className="dash-stat flex flex-row md:flex-col items-center md:items-start justify-between md:justify-start flex-1 md:flex-none md:min-w-[140px] px-6 py-5 rounded-2xl glass-panel bg-[#0A0A0A]/40 border-white/5 relative overflow-hidden group hover:border-color-primary/30 transition-all duration-500">
                            <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-r from-transparent via-color-primary/20 to-transparent" />
                            <span className="text-[10px] text-color-support/40 uppercase tracking-[0.15em] font-bold block md:mb-3">Total Assets</span>
                            <span className="text-3xl font-mono text-white tracking-tighter group-hover:text-color-primary transition-colors">{isLoading ? "..." : assets.length}</span>
                        </div>

                        <div className="dash-stat flex-1 md:min-w-[300px] relative group/search">
                            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-color-support/30 group-focus-within/search:text-color-primary transition-colors">
                                <Search size={18} />
                            </div>
                            <input
                                type="text"
                                placeholder="Search Vault..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-[#0A0A0A]/40 border border-white/5 rounded-2xl py-5 pl-14 pr-6 text-white text-sm outline-none focus:border-color-primary/40 focus:bg-[#0A0A0A]/60 transition-all glass-panel placeholder:text-color-support/20 font-medium"
                            />
                        </div>
                    </div>
                </div>

                <GlassCard className="assets-container p-0 overflow-hidden border-white/5 bg-[#050505]/90 backdrop-blur-3xl rounded-3xl">
                    {/* Table Header */}
                    <div className="hidden md:grid grid-cols-12 gap-4 p-5 border-b border-white/5 text-color-support/40 text-[10px] font-bold uppercase tracking-[0.2em] bg-[#0A0A0A]">
                        <div className="col-span-6">Asset Name</div>
                        <div className="col-span-2">Capacity</div>
                        <div className="col-span-2 text-center">Download</div>
                        <div className="col-span-2 text-right">Share</div>
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
                            assets
                                .filter(asset => {
                                    const name = asset.blobNameSuffix || (typeof asset.name === 'string' ? asset.name.replace(/^@[^/]+\//, '') : asset.name);
                                    return name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                           (asset.blob_merkle_root && asset.blob_merkle_root.toLowerCase().includes(searchQuery.toLowerCase()));
                                })
                                .map((asset, index) => {
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
            {/* Asset Identity */}
            <div className="w-full col-span-12 md:col-span-6 flex items-center gap-4 relative z-10">
                <div className="w-12 h-12 rounded-xl glass-panel bg-[#050505] flex items-center justify-center shadow-2xl group-hover:scale-110 group-hover:border-color-primary/30 transition-all duration-500 border border-white/5 shrink-0">
                    {isImg ? (
                        <ImageIcon className="text-color-accent group-hover:text-white transition-colors" size={20} />
                    ) : (
                        <FileText className="text-color-support/60 group-hover:text-white transition-colors" size={20} />
                    )}
                </div>
                <div className="flex flex-col min-w-0">
                    <span className="text-white font-bold truncate text-base group-hover:text-color-primary transition-colors duration-300">{displayName}</span>
                    <span className="md:hidden text-color-support/40 text-[10px] font-mono tracking-widest uppercase mt-1">
                        {sizeMB} MB • SECURED
                    </span>
                </div>
            </div>

            {/* Capacity (Desktop Only) */}
            <div className="hidden md:flex col-span-2 relative z-10 flex-col">
                <span className="text-white/80 font-mono text-xs tracking-widest">{sizeMB} MB</span>
            </div>

            {/* Download Button */}
            <div className="w-full md:col-span-2 relative z-10 flex md:justify-center items-center mt-4 md:mt-0">
                <button
                    className={`w-full md:w-12 md:h-12 flex items-center justify-center gap-2 md:gap-0 px-5 py-3 md:p-0 rounded-xl transition-all shadow-lg ${status === 'live' ? 'bg-white/5 hover:bg-color-accent text-white hover:scale-110' : 'bg-white/5 text-color-support/20 cursor-not-allowed'}`}
                    title={status === 'live' ? "Download Payload" : "Indexing..."}
                    onClick={status === 'live' ? handleDownload : (e) => e.stopPropagation()}
                    disabled={status !== 'live'}
                >
                    <Download size={18} />
                    <span className="md:hidden font-bold text-[10px] uppercase tracking-[0.2em]">Download File</span>
                </button>
            </div>

            {/* Share Button */}
            <div className="w-full md:col-span-2 relative z-10 flex md:justify-end items-center mb-2 md:mb-0">
                <button
                    className="w-full md:w-12 md:h-12 flex items-center justify-center gap-2 md:gap-0 px-5 py-3 md:p-0 rounded-xl bg-color-primary/10 hover:bg-color-primary text-color-primary hover:text-white transition-all duration-300 shadow-lg"
                    onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(downloadUrl);
                        alert("Secure link copied to clipboard");
                    }}
                >
                    <LinkIcon size={18} />
                    <span className="md:hidden font-bold text-[10px] uppercase tracking-[0.2em]">Copy Share Link</span>
                </button>
            </div>
        </div>
    );
}
