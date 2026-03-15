"use client";

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Lock, FileText, Image as ImageIcon, Database, Link as LinkIcon, Download, PackageOpen, Loader2, CheckCircle2, Clock, Search } from 'lucide-react';
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
