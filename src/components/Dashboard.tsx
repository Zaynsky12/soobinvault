"use client";

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Lock, FileText, Image as ImageIcon, Database, Link as LinkIcon, Download, PackageOpen, Loader2, CheckCircle2, Clock, Search, Trash2, Key, RefreshCw, MoreVertical, Eye, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { GlassCard } from './ui/GlassCard';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useShelbyClient, useDeleteBlobs } from "@shelby-protocol/react";
import { LinkPreviewModal } from './LinkPreviewModal';
import { decryptFile, decryptText } from '../utils/crypto';
import { useVaultKey } from '../context/VaultKeyContext';
import { getFileType } from '../utils/file';

// Register GSAP plugins
if (typeof window !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
}

export function Dashboard() {
    const containerRef = useRef<HTMLDivElement>(null);
    const { account, connected, signAndSubmitTransaction } = useWallet();
    const shelbyClient = useShelbyClient();
    const [assets, setAssets] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [optimisticAssets, setOptimisticAssets] = useState<any[]>([]);
    const { ensureKey, encryptionKey, importKeyManual, lockVault } = useVaultKey();

    // Modal State
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState<{
        name: string;
        url: string;
        sizeStr: string;
        isImage: boolean;
        isVideo: boolean;
        isText: boolean;
        isAudio: boolean;
        isDocument: boolean;
        hash: string;
        txHash: string;
        blobAccount: string;
        blobName: string;
    } | null>(null);

    const [decryptedNames, setDecryptedNames] = useState<Record<string, string>>({});

    // Deletion Hook
    const deleteBlobs = useDeleteBlobs({
        client: shelbyClient,
    });

    const handleDeleteSelectedAsset = async () => {
        if (!account || !signAndSubmitTransaction || !selectedAsset) {
            toast.error("Wallet not connected or asset missing.");
            return;
        }

        const confirmDelete = window.confirm(`Are you sure you want to delete ${selectedAsset.name}? This action is permanent and will remove the file's metadata from the blockchain.`);

        if (!confirmDelete) return;

        // Extract the original name suffix
        const nameStr = selectedAsset.name;
        const nameMatch = nameStr.match(/^@([^/]+)\/(.+)$/);
        const nameSuffix = nameMatch ? nameMatch[2] : (selectedAsset.blobName || nameStr);

        try {
            toast.loading(`Deleting ${selectedAsset.name}...`, { id: 'delete-blob-modal' });

            await deleteBlobs.mutateAsync({
                signer: {
                    account: account.address,
                    signAndSubmitTransaction: (tx: any) => signAndSubmitTransaction({
                        ...tx,
                        sender: account.address
                    }),
                } as any,
                blobNames: [nameSuffix]
            });

            toast.success(`${selectedAsset.name} deleted successfully! Refreshing list...`, { id: 'delete-blob-modal' });

            setIsPreviewModalOpen(false);

            setTimeout(() => {
                fetchBlobs();
            }, 3000);
        } catch (err) {
            console.error("Deletion failed:", err);
            toast.error(err instanceof Error ? err.message : "Failed to delete", { id: 'delete-blob-modal' });
        }
    };


    const fetchBlobs = async () => {
        if (!account) return;
        setIsLoading(true);
        try {
            const blobs = await shelbyClient.coordination.getAccountBlobs({
                account: account.address.toString(),
            });

            // Sort assets by descent order (latest first) based on official SDK field and indexer fields
            const sortedBlobs = (blobs || []).sort((a: any, b: any) => {
                const timeA = a.creationMicros || a.timestamp || a.createdAt || a.indexedAt || a.indexed_at || a.block_timestamp || 0;
                const timeB = b.creationMicros || b.timestamp || b.createdAt || b.indexedAt || b.indexed_at || b.block_timestamp || 0;

                // If we have timestamps, sort by them (descending: newest first)
                if (timeA && timeB) return Number(timeB) - Number(timeA);

                // If only one has a timestamp, the other goes to the bottom
                if (timeA && !timeB) return -1;
                if (!timeA && timeB) return 1;

                return 0;
            });

            // If no timestamps were found to sort by, and the list isn't empty, 
            // reverse it as a safe fallback for "newest first" (most APIs return oldest first).
            const firstBlob = sortedBlobs[0] as any;
            if (sortedBlobs.length > 0 && !(firstBlob.creationMicros || firstBlob.timestamp || firstBlob.indexed_at)) {
                setAssets([...sortedBlobs].reverse());
            } else {
                setAssets(sortedBlobs);
            }
        } catch (error: any) {
            console.error("Failed to fetch blobs", error);
            const msg = (error?.message || String(error)).toLowerCase();

            if (msg.includes('monthlycredit cap') || msg.includes('credit refresh')) {
                toast.error("Monthly credit cap reached for Shelby Protocol. Please check billing at geomi.dev.", { duration: 6000 });
            } else if (msg.includes('401') || msg.includes('unauthorized')) {
                toast.error("Invalid session or API Key issue. Please log in again.");
            } else {
                toast.error("Failed to synchronize with Vault (Network Error).");
            }
        } finally {
            setIsLoading(false);
        }
    };


    useEffect(() => {
        if (!account) {
            setAssets([]);
            setOptimisticAssets([]);
            return;
        }

        fetchBlobs();

        // Listen for successful uploads from VaultDropzone
        const handleUploadSuccess = (e: any) => {
            if (e.detail) {
                // Add to optimistic state
                const newAsset = {
                    name: e.detail.name,
                    size: e.detail.size,
                    transaction_hash: e.detail.txHash,
                    timestamp: e.detail.timestamp,
                    isOptimistic: true,
                    status: 'syncing'
                };
                setOptimisticAssets(prev => [newAsset, ...prev]);
            }
            fetchBlobs();
        };

        window.addEventListener('vault:uploadSuccess', handleUploadSuccess);

        // Listen for manual refresh from Navbar
        const handleManualRefresh = () => {
            fetchBlobs();
        };

        window.addEventListener('vault:refresh', handleManualRefresh);

        return () => {
            window.removeEventListener('vault:uploadSuccess', handleUploadSuccess);
            window.removeEventListener('vault:refresh', handleManualRefresh);
        };
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

    // Background decryption of filenames
    useEffect(() => {
        if (!encryptionKey || assets.length === 0) return;

        const decryptAll = async () => {
            const newNames: Record<string, string> = { ...decryptedNames };
            let changed = false;

            for (const asset of assets) {
                const nameStr = typeof asset.name === 'string' ? asset.name : '';
                const nameMatch = nameStr.match(/^@([^/]+)\/(.+)$/);
                const nameOnly = nameMatch ? nameMatch[2] : (asset.blobNameSuffix || nameStr);

                if (nameOnly && nameOnly.endsWith('.vault') && !newNames[nameOnly]) {
                    try {
                        const base64 = nameOnly.replace(/\.vault$/, '').replace(/_/g, '/').replace(/-/g, '+');
                        const decrypted = await decryptText(base64, encryptionKey);
                        newNames[nameOnly] = decrypted;
                        changed = true;
                    } catch (e) {
                        // Not a new-style encrypted name, skip
                    }
                }
            }

            if (changed) {
                setDecryptedNames(newNames);
            }
        };

        decryptAll();
    }, [assets, encryptionKey]);

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

                {/* Mobile Fixed Search Bar (Google Drive Style) - Compact Version */}
                <div className="md:hidden fixed top-[80px] left-0 right-0 z-[40] px-6 animate-in slide-in-from-top duration-500 pointer-events-none pb-2">
                    <div className="max-w-sm mx-auto bg-[#0B1121]/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl flex items-center px-3 py-2 group focus-within:border-color-primary/40 transition-all pointer-events-auto">
                        <Search size={16} className="text-color-support/40 mr-2.5" />
                        <input
                            type="text"
                            placeholder="Search Vault..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1 bg-transparent border-none outline-none text-white text-xs placeholder:text-color-support/20 font-medium"
                        />
                        <button
                            onClick={() => fetchBlobs()}
                            disabled={isLoading}
                            className={`w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center ml-2 shadow-lg shrink-0 hover:bg-white/10 active:scale-90 transition-all ${isLoading ? 'opacity-50' : ''}`}
                        >
                            <RefreshCw size={14} className={`text-color-support/60 ${isLoading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-700'}`} />
                        </button>
                    </div>

                    {/* Mobile Filter Chips */}
                    <div className="flex flex-wrap justify-center gap-2 mt-4 pb-2 pointer-events-auto">
                        {['All', 'Image', 'Video', 'Document'].map((chip) => (
                            <button
                                key={chip}
                                className={`px-4 py-1.5 rounded-full border text-[11px] font-bold uppercase tracking-widest whitespace-nowrap transition-all ${(chip === 'All' && !searchQuery) || (searchQuery && chip.toLowerCase().includes(searchQuery.toLowerCase()))
                                    ? 'bg-color-primary/20 border-color-primary/40 text-color-primary'
                                    : 'bg-white/5 border-white/5 text-color-support/40'
                                    }`}
                                onClick={() => {
                                    if (chip === 'All') setSearchQuery('');
                                    else setSearchQuery(chip.toLowerCase());
                                }}
                            >
                                {chip}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="hidden md:flex flex-col md:flex-row justify-between items-start md:items-end mb-0 md:mb-12 md:border-b border-white/5 md:pb-8 md:mt-0 mt-48">
                    <div className="hidden md:flex flex-col items-start">
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border mb-4 transition-all duration-500 ${connected
                            ? 'bg-green-500/10 border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.15)]'
                            : 'bg-red-500/10 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]'
                            }`}>
                            <span className={`w-2 h-2 rounded-full transition-all duration-500 ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-500'
                                }`} />
                            <span className={`text-[10px] font-bold uppercase tracking-[0.15em] transition-colors duration-500 ${connected ? 'text-green-400' : 'text-red-400'
                                }`}>
                                Vault Protocol {connected ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                        <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4 text-white tracking-tight leading-none text-center md:text-left">{connected ? 'My Vault' : 'Your Vault'}</h2>
                        <p className="text-color-support/60 text-base sm:text-lg font-normal max-w-md leading-relaxed text-center md:text-left mx-auto md:mx-0">Orchestrate and monitor your distributed assets across the decentralized infrastructure.</p>
                    </div>

                    <div className="w-full md:w-auto flex flex-col sm:flex-row items-center md:items-end gap-3 md:gap-4 mt-6 md:mt-0">
                        {/* Desktop Only Stats & Search */}
                        <div className="hidden md:flex flex-col md:flex-row items-end gap-4">
                            <div className="dash-stat flex flex-row md:flex-col items-center md:items-start justify-between md:justify-start w-full sm:w-auto md:min-w-[140px] px-6 py-4 rounded-2xl glass-panel bg-[#0A0A0A]/40 border-white/5 relative overflow-hidden group hover:border-color-primary/30 transition-all duration-500">
                                <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-r from-transparent via-color-primary/20 to-transparent" />
                                <span className="text-[10px] text-color-support/40 uppercase tracking-[0.15em] font-bold block md:mb-2">Total Assets</span>
                                <span className="text-2xl md:text-3xl font-mono text-white tracking-tighter group-hover:text-color-primary transition-colors">{isLoading ? "..." : assets.length}</span>
                            </div>

                            <div className="dash-stat w-full md:min-w-[400px] relative flex items-center group/search">
                                <div className="relative flex-grow">
                                    <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-color-support/30 group-focus-within/search:text-color-primary transition-colors">
                                        <Search size={18} />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search Vault..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-[#0A0A0A]/60 border border-white/10 rounded-2xl py-4 pl-14 pr-24 text-white text-sm outline-none focus:border-color-primary/40 focus:bg-[#0A0A0A]/80 transition-all glass-panel placeholder:text-color-support/20 font-medium"
                                    />
                                    <button
                                        onClick={() => fetchBlobs()}
                                        disabled={isLoading}
                                        className={`absolute right-2 top-2 bottom-2 px-4 rounded-xl border border-white/10 bg-white/5 text-color-support/50 hover:text-white hover:border-white/20 hover:bg-white/10 transition-all flex items-center justify-center gap-2 group/sync ${isLoading ? 'opacity-50' : ''}`}
                                        title="Manual Sync"
                                    >
                                        <RefreshCw size={16} className={`transition-transform duration-700 ${isLoading ? 'animate-spin' : 'group-hover/sync:rotate-180'}`} />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Sync</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <GlassCard className="assets-container p-0 md:p-0 overflow-hidden border-none md:border md:border-white/5 bg-transparent md:bg-[#050505]/90 backdrop-blur-3xl rounded-3xl">
                    {/* Table Header (Desktop Only) */}
                    <div className="hidden md:grid grid-cols-12 gap-4 p-5 border-b border-white/5 text-color-support/40 text-[10px] font-bold uppercase tracking-[0.2em] bg-[#0A0A0A]">
                        <div className="col-span-6">Asset Name</div>
                        <div className="col-span-2">Capacity</div>
                        <div className="col-span-2 text-center">Download</div>
                        <div className="col-span-2 text-right">DELETE</div>
                    </div>

                    {/* Asset Rows/List */}
                    <div className="md:divide-y md:divide-white/5 min-h-[200px] md:max-w-none max-w-2xl mx-auto divide-y divide-white/5 bg-white/[0.02] border border-white/10 rounded-2xl md:bg-transparent md:border-none md:rounded-none relative shadow-2xl">
                        {!account ? (
                            <div className="p-12 text-center text-color-support/60 flex flex-col items-center">
                                <Lock size={48} className="mb-4 opacity-50" />
                                <p>Connect your Petra Wallet to view your secure Vault.</p>
                            </div>
                        ) : !encryptionKey ? (
                            <div className="p-20 text-center flex flex-col items-center justify-center bg-[#050505] m-6 rounded-[2.5rem] border border-color-primary/20 shadow-[0_0_50px_rgba(232,58,118,0.05)] relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-br from-color-primary/5 via-transparent to-color-accent/5 opacity-50" />
                                <div className="relative z-10 w-full flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
                                    <div className="w-24 h-24 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center mb-8 mx-auto shadow-[0_0_40px_rgba(232,58,118,0.2)] border border-color-primary/30">
                                        <Lock size={48} className="text-color-primary" />
                                    </div>
                                    <h3 className="text-3xl font-bold text-white mb-4 tracking-tight">Vault Securely Locked</h3>
                                    <p className="text-color-support/60 mb-10 max-w-sm mx-auto font-light leading-relaxed text-lg">
                                        Your session has been locked for your security. Unlock the vault to decrypt and view your files.
                                    </p>
                                    <button
                                        onClick={() => ensureKey(false)}
                                        className="px-10 py-4 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold uppercase tracking-widest text-xs hover:scale-105 transition-all w-full max-w-xs shadow-[0_0_30px_rgba(255,255,255,0.05)]"
                                    >
                                        Unlock Secure Vault
                                    </button>
                                </div>
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
                            (() => {
                                const sortedReal = [...assets].sort((a, b) => {
                                    const timeA = a.timestamp || a.creationMicros || a.createdAt || a.indexedAt || a.indexed_at || a.block_timestamp || 0;
                                    const timeB = b.timestamp || b.creationMicros || b.createdAt || b.indexedAt || b.indexed_at || b.block_timestamp || 0;
                                    if (timeA && timeB) return Number(timeB) - Number(timeA);
                                    return 0;
                                });

                                // Optimistic assets (just uploaded) always go to the top
                                const combined = [...optimisticAssets, ...sortedReal]
                                    .filter((asset, index, self) => {
                                        const tx = asset.transaction_hash || asset.tx_hash || asset.upload_tx_hash;
                                        const name = asset.blobNameSuffix || asset.name;

                                        return self.findIndex(a => {
                                            const aTx = a.transaction_hash || a.tx_hash || a.upload_tx_hash;
                                            const aName = a.blobNameSuffix || a.name;
                                            return (tx && aTx && tx === aTx) || (name && aName && name === aName);
                                        }) === index;
                                    });

                                const filteredAssets = combined.filter(asset => {
                                    const assetHash = asset.blob_merkle_root || asset.merkle_root || asset.merkleRoot || asset.hash || asset.blob_hash || asset.blob_id || asset.blobId || (asset.metadata && (asset.metadata.blob_merkle_root || asset.metadata.merkle_root || asset.metadata.hash)) || '';
                                    const nameStr = typeof asset.name === 'string' ? asset.name : '';
                                    const nameMatch = nameStr.match(/^@([^/]+)\/(.+)$/);
                                    const nameOnly = nameMatch ? nameMatch[2] : (asset.blobNameSuffix || nameStr);

                                    const decryptedName = decryptedNames[nameOnly];
                                    const nameToSearch = decryptedName || nameOnly || '';
                                    const fileType = getFileType(nameToSearch);

                                    const query = (searchQuery || '').toLowerCase().trim();
                                    if (!query) return true;

                                    const matchesName = String(nameToSearch).toLowerCase().includes(query);
                                    const matchesHash = assetHash && String(assetHash).toLowerCase().includes(query);
                                    
                                    // Category matching
                                    const isImageQuery = query === 'image' || query === 'photo' || query === 'pic' || query === 'img';
                                    const isVideoQuery = query === 'video' || query === 'movie' || query === 'clip' || query === 'vid';
                                    const isAudioQuery = query === 'audio' || query === 'music' || query === 'song' || query === 'mp3';
                                    const isDocQuery = query === 'document' || query === 'doc' || query === 'pdf' || query === 'file';

                                    const matchesCategory = 
                                        (isImageQuery && fileType.isImage) ||
                                        (isVideoQuery && fileType.isVideo) ||
                                        (isAudioQuery && fileType.isAudio) ||
                                        (isDocQuery && fileType.isDocument);

                                    return matchesName || matchesHash || matchesCategory;
                                });

                                if (filteredAssets.length === 0 && (searchQuery || '').trim() !== '') {
                                    return (
                                        <div className="p-16 text-center flex flex-col items-center justify-center opacity-70 w-full animate-in fade-in duration-500">
                                            <Search size={48} className="mb-4 opacity-30 text-white" />
                                            <p className="text-color-support/60 text-lg">No assets found matching <span className="text-white font-bold">"{searchQuery}"</span></p>
                                        </div>
                                    );
                                }

                                return filteredAssets.map((asset, index) => {
                                    const nameStr = typeof asset.name === 'string' ? asset.name : '';
                                    const nameMatch = nameStr.match(/^@([^/]+)\/(.+)$/);
                                    const nameOnly = nameMatch ? nameMatch[2] : (asset.blobNameSuffix || nameStr);

                                    const decryptedName = decryptedNames[nameOnly];
                                    const displayName: string = decryptedName || nameOnly;
                                    const sizeMB = (asset.size / (1024 * 1024)).toFixed(2);
                                    const fileInfo = getFileType(displayName);
                                    const isImg = fileInfo.isImage;
                                    const isVid = fileInfo.isVideo;
                                    const isTxt = fileInfo.isText;
                                    const isAudio = fileInfo.isAudio;
                                    const isDocument = fileInfo.isDocument;

                                    // Robust extraction of identifier and name from indexer "@identifier/path" format
                                    if (index === 0) console.log('[Debug] Asset structure:', JSON.stringify(asset, null, 2));

                                    // Use extracted identifier or fallback to account address
                                    const identifier = nameMatch ? nameMatch[1] : (account?.address?.toString() || '');
                                    // Ensure the identifier has the 0x prefix if it appears to be a raw hex address
                                    let finalIdentifier = identifier;
                                    const isHex = /^[0-9a-fA-F]+$/.test(finalIdentifier);
                                    if (finalIdentifier && !finalIdentifier.startsWith('0x') && isHex && finalIdentifier.length >= 60) {
                                        finalIdentifier = `0x${finalIdentifier}`;
                                    }

                                    // Construct the download URL with strict encoding for both parts, but allowing slashes to remain literal for paths
                                    const rpcBaseUrl = shelbyClient.baseUrl;
                                    const downloadUrl = (finalIdentifier && nameOnly)
                                        ? `${rpcBaseUrl}/v1/blobs/${encodeURIComponent(finalIdentifier)}/${nameOnly.split('/').map((segment: string) => encodeURIComponent(segment)).join('/')}`
                                        : null;

                                    if (index === 0) {
                                        console.log(`[Debug] URL Construction for ${displayName}:`, {
                                            rawIdentifier: identifier,
                                            finalIdentifier,
                                            nameOnly,
                                            downloadUrl
                                        });
                                    }

                                    const assetHash = asset.blob_merkle_root ||
                                        asset.merkle_root ||
                                        asset.merkleRoot ||
                                        asset.hash ||
                                        asset.blob_hash ||
                                        asset.blob_id ||
                                        asset.blobId ||
                                        (asset.metadata && (asset.metadata.blob_merkle_root || asset.metadata.merkle_root || asset.metadata.hash)) ||
                                        '';

                                    // Extract transaction hash specifically for Explorer link
                                    const txHash = asset.transaction_hash ||
                                        asset.tx_hash ||
                                        asset.upload_tx_hash ||
                                        asset.creation_tx_hash ||
                                        asset.transactionHash ||
                                        asset.blob_transaction_hash ||
                                        asset.txHash ||
                                        (asset.metadata && (
                                            asset.metadata.transaction_hash ||
                                            asset.metadata.tx_hash ||
                                            asset.metadata.upload_tx_hash ||
                                            asset.metadata.transactionHash
                                        )) ||
                                        '';

                                    // Debug log for identifying hash fields if none found
                                    if (!assetHash && index === 0) {
                                        console.log("Asset structure debug (missing hash):", asset);
                                    }
                                    const handleOpenPreview = () => {
                                        setSelectedAsset({
                                            name: displayName,
                                            url: '',
                                            sizeStr: sizeMB,
                                            isImage: isImg,
                                            isVideo: isVid,
                                            isText: isTxt,
                                            isAudio: !!displayName.toLowerCase().match(/\.(mp3|wav|ogg|flac|aac|m4a|opus|wma)$/),
                                            isDocument: !!displayName.toLowerCase().match(/\.(doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|rtf|epub|pages|numbers|key|zip|rar|7z|gz|tar)$/),
                                            hash: assetHash,
                                            txHash: txHash,
                                            blobAccount: finalIdentifier,
                                            blobName: nameOnly
                                        });
                                        setIsPreviewModalOpen(true);
                                    };


                                    return (
                                        <AssetRow
                                            key={`${asset.blob_merkle_root}-${index}`}
                                            asset={asset}
                                            index={index}
                                            displayName={displayName}
                                            sizeMB={sizeMB}
                                            isImg={isImg}
                                            isVid={isVid}
                                            isTxt={isTxt}
                                            downloadUrl={downloadUrl}
                                            handleOpenPreview={handleOpenPreview}
                                            assetHash={assetHash}
                                            txHash={txHash}
                                            deleteBlobs={deleteBlobs}
                                            fetchBlobs={fetchBlobs}
                                            signAndSubmitTransaction={signAndSubmitTransaction}
                                            account={account}
                                            shelbyClient={shelbyClient}
                                            setOptimisticDeletions={setOptimisticAssets}
                                        />
                                    );
                                })
                            })()
                        )}
                    </div>

                    {/* Pagination / Footer */}
                    <div className="p-6 border-t border-white/5 flex justify-between items-center bg-black/30">
                        <span className="text-sm text-color-support/50 font-medium">Viewing secure assets on the decentralized network.</span>
                    </div>
                </GlassCard>

            </div>

            {/* Link Preview Modal */}
            <LinkPreviewModal
                isOpen={isPreviewModalOpen}
                onClose={() => setIsPreviewModalOpen(false)}
                assetName={selectedAsset?.name || ''}
                assetHash={selectedAsset?.hash || ''}
                txHash={selectedAsset?.txHash || ''}
                assetUrl={selectedAsset?.url || null}
                assetSizeStr={selectedAsset?.sizeStr || '0'}
                isImage={selectedAsset?.isImage || false}
                isVideo={selectedAsset?.isVideo || false}
                isText={selectedAsset?.isText || false}
                isAudio={selectedAsset?.isAudio || false}
                isDocument={selectedAsset?.isDocument || false}
                apiKey={shelbyClient.rpc.apiKey}
                onDownload={() => {
                    // This is handled by a direct link in the modal now
                    console.log('Download triggered from modal');
                }}
                blobAccount={selectedAsset?.blobAccount}
                blobName={selectedAsset?.blobName}
                shelbyClient={shelbyClient}
                accountAddress={account?.address.toString()}
                onDelete={handleDeleteSelectedAsset}
            />

            {/* Floating Action Button (Mobile) */}
            <Link
                href="/vault"
                className="md:hidden fixed bottom-24 right-6 w-14 h-14 bg-gradient-to-br from-color-primary to-color-accent rounded-2xl flex items-center justify-center text-white shadow-[0_8px_32px_rgba(232,58,118,0.4)] z-[50] animate-in zoom-in-50 duration-500 hover:scale-110 active:scale-95 transition-transform"
            >
                <PlusCircle size={28} />
            </Link>
        </section>
    );
}

function AssetRow({ asset, index, displayName, sizeMB, isImg, isVid, isTxt, downloadUrl, handleOpenPreview, assetHash, txHash, deleteBlobs, fetchBlobs, signAndSubmitTransaction, account, shelbyClient, setOptimisticDeletions }: any): React.ReactNode {
    const { ensureKey } = useVaultKey();
    const [status, setStatus] = useState<'checking' | 'syncing' | 'live'>('checking');
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        if (!downloadUrl) return;

        const checkStatus = async () => {
            const apiKey = shelbyClient.rpc.apiKey || process.env.NEXT_PUBLIC_SHELBY_API_KEY || "aptoslabs_8nf7TvDNviM_BvorzGpZdTDDZPsPpPorTcctVeD9F45Fu";
            try {
                const response = await fetch(downloadUrl!, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKey.trim()}`,
                        'Range': 'bytes=0-0'
                    }
                });

                if (response.ok) {
                    setStatus('live');
                } else {
                    if (response.status === 429) {
                        setTimeout(checkStatus, 15000);
                    } else {
                        setStatus('syncing');
                        setTimeout(checkStatus, 5000 + Math.random() * 2000);
                    }
                }
            } catch (e) {
                setStatus('checking');
                setTimeout(checkStatus, 10000);
            }
        };

        if (status !== 'live') checkStatus();
    }, [downloadUrl, status]);

    const handleDownload = async (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();

        if (status !== 'live') {
            toast("File is still indexing. Please try again in 30 seconds.", { icon: '⏳' });
            return;
        }

        if (!account) {
            toast.error("Wallet not connected");
            return;
        }

        const downloadToastId = toast.loading(`Decrypting ${displayName}...`);

        try {
            const apiKey = shelbyClient.rpc.apiKey || process.env.NEXT_PUBLIC_SHELBY_API_KEY || "aptoslabs_8nf7TvDNviM_BvorzGpZdTDDZPsPpPorTcctVeD9F45Fu";
            const response = await fetch(downloadUrl!, {
                headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
            });

            if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
            const encryptedBuffer = await response.arrayBuffer();

            const cryptoKey = await ensureKey();
            if (!cryptoKey) {
                toast.error("Decryption key required for download.", { id: downloadToastId });
                return;
            }

            const { blob, metadata } = await decryptFile(encryptedBuffer, cryptoKey);

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = metadata.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.success('Downloaded!', { id: downloadToastId });
        } catch (err) {
            console.error('Download failed:', err);
            toast.error('Failed to decrypt and download.', { id: downloadToastId });
        }
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();

        if (!account || !signAndSubmitTransaction) {
            toast.error("Wallet not connected. Please connect your wallet to delete assets.");
            return;
        }

        const confirmDelete = window.confirm(`Are you sure you want to delete ${displayName}? This action is permanent and will remove the file's metadata from the blockchain.`);

        if (!confirmDelete) return;

        // Extract the original name suffix (without the @address/ prefix)
        const nameStr = typeof asset.name === 'string' ? asset.name : '';
        const nameMatch = nameStr.match(/^@([^/]+)\/(.+)$/);
        const nameSuffix = nameMatch ? nameMatch[2] : (asset.blobNameSuffix || nameStr);

        try {
            toast.loading(`Deleting ${displayName}...`, { id: 'delete-blob' });

            await deleteBlobs.mutateAsync({
                signer: {
                    account: account?.address,
                    signAndSubmitTransaction: (tx: any) => signAndSubmitTransaction({
                        ...tx,
                        sender: account?.address
                    }),
                } as any,
                blobNames: [nameSuffix]
            });

            toast.success(`${displayName} deleted successfully! Refreshing list in 3 seconds...`, { id: 'delete-blob' });

            // Wait for 3 seconds before refreshing to ensure the network has finalized the state
            setTimeout(() => {
                fetchBlobs();
            }, 3000);
        } catch (err) {
            console.error("Deletion failed:", err);
            toast.error(err instanceof Error ? err.message : "Failed to delete", { id: 'delete-blob' });
        }
    };


    return (
        <div
            className={`asset-row flex items-center justify-between md:grid md:grid-cols-12 gap-4 p-5 md:p-6 transition-all duration-500 relative overflow-hidden border-b border-white/5 last:border-0 hover:bg-white/[0.03] cursor-pointer group ${status !== 'live' ? 'opacity-80' : ''}`}
            onClick={handleOpenPreview}
        >
            {/* Hover Background Artifact */}
            <div className="absolute inset-0 bg-gradient-to-r from-color-primary/[0.03] via-transparent to-color-accent/[0.03] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            {/* Asset Identity */}
            <div className="flex-1 min-w-0 md:col-span-6 flex items-center gap-4 relative z-10 pr-2 md:pr-0">
                <div className="w-12 h-12 rounded-xl glass-panel bg-[#050505] flex items-center justify-center shadow-2xl group-hover:scale-110 group-hover:border-color-primary/30 transition-all duration-500 border border-white/5 shrink-0">
                    {isImg ? (
                        <ImageIcon className="text-color-accent group-hover:text-white transition-colors" size={20} />
                    ) : isVid ? (
                        <PackageOpen className="text-color-primary group-hover:text-white transition-colors" size={20} />
                    ) : isTxt ? (
                        <FileText className="text-color-support group-hover:text-white transition-colors" size={20} />
                    ) : (
                        <Database className="text-color-support/40 group-hover:text-white transition-colors" size={20} />
                    )}
                </div>
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-white font-bold truncate text-base group-hover:text-color-primary transition-colors duration-300">{displayName}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-color-support/40 text-[10px] font-mono tracking-widest uppercase mt-0.5">
                            {sizeMB} MB
                        </span>
                        <span className="text-color-support/20 text-[10px] mt-0.5">•</span>
                        <span className="text-green-500/40 text-[10px] font-bold uppercase tracking-widest mt-0.5">SECURED</span>
                    </div>
                </div>
            </div>

            {/* Mobile 3-Dot Menu Button */}
            <div className="md:hidden relative z-10 shrink-0">
                <button
                    className="p-3 -mr-2 text-color-support/40 hover:text-white transition-colors rounded-full hover:bg-white/10 active:scale-95"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(true);
                    }}
                >
                    <MoreVertical size={20} />
                </button>
            </div>

            {/* Capacity (Desktop Only) */}
            <div className="hidden md:flex md:col-span-2 relative z-10 flex-col">
                <span className="text-white/80 font-mono text-xs tracking-widest">{sizeMB} MB</span>
            </div>

            {/* Download Button (Desktop Only) */}
            <div className="hidden w-full md:col-span-2 relative z-10 md:flex md:justify-center items-center mt-4 md:mt-0">
                <button
                    className={`w-full md:w-11 md:h-11 flex items-center justify-center gap-3 md:gap-0 px-5 py-3 md:p-0 rounded-xl transition-all duration-700 shadow-lg ${status === 'live'
                        ? 'bg-color-accent/20 border border-color-accent/40 text-white hover:bg-color-accent hover:scale-110 shadow-[0_0_20px_rgba(232,58,118,0.2)] animate-glow-activate'
                        : 'bg-white/5 text-color-support/20 opacity-50 cursor-not-allowed border border-white/5'
                        } ${status === 'live' && asset.isOptimistic ? 'animate-bounce-short' : ''}`}
                    title={status === 'live' ? "Download Payload" : "File sedang dalam proses finalisasi..."}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (status === 'live') {
                            handleDownload();
                        } else {
                            toast("File is being finalized... Please retry in 30 seconds.", { icon: '⏳' });
                        }
                    }}
                >
                    <Download size={18} />
                </button>
            </div>

            {/* Actions Button (Delete) (Desktop Only) */}
            <div className="hidden w-full md:col-span-2 relative z-10 md:flex md:justify-end items-center mb-2 md:mb-0">
                <button
                    className="w-full md:w-11 md:h-11 flex items-center justify-center gap-3 md:gap-0 px-5 py-3 md:p-0 rounded-xl bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white transition-all duration-300 shadow-lg group/delete"
                    onClick={handleDelete}
                    title="Delete"
                    disabled={deleteBlobs.isPending}
                >
                    {deleteBlobs.isPending ? (
                        <Loader2 size={18} className="animate-spin" />
                    ) : (
                        <Trash2 size={18} />
                    )}
                </button>
            </div>

            {/* Mobile Options Drawer */}
            {isMenuOpen && typeof window !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-[110] flex items-end justify-center md:hidden bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); }}
                >
                    <div
                        className="bg-[#0A0A0A]/98 backdrop-blur-3xl border-t border-white/10 w-full rounded-t-[2.5rem] p-6 pb-12 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] flex flex-col gap-4 animate-in slide-in-from-bottom duration-500 transform-gpu"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-4" onClick={() => setIsMenuOpen(false)}></div>

                        <div className="mb-4 flex items-center gap-4 border-b border-white/5 pb-5">
                            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 shadow-inner">
                                {isImg ? <ImageIcon size={28} className="text-color-accent" /> : isVid ? <PackageOpen size={28} className="text-color-primary" /> : <FileText size={28} className="text-color-support" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-white font-bold truncate text-xl leading-snug">{displayName}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="px-2 py-0.5 rounded-md bg-white/5 text-color-support/40 text-[10px] font-mono tracking-widest uppercase border border-white/5">
                                        {sizeMB} MB
                                    </span>
                                    <span className="text-color-support/20 text-[10px]">•</span>
                                    <span className="text-color-support/40 text-[10px] font-bold uppercase tracking-widest text-[#22C55E]">SECURED</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={(e) => {
                                    setIsMenuOpen(false);
                                    handleOpenPreview();
                                }}
                                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 text-white active:bg-white/10 transition-all active:scale-[0.98] group"
                            >
                                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                                    <Eye size={22} />
                                </div>
                                <div className="text-left">
                                    <span className="block font-bold text-sm uppercase tracking-widest">Preview Asset</span>
                                    <span className="block text-[10px] text-color-support/40 mt-0.5 uppercase tracking-wider">Instant data visualization</span>
                                </div>
                            </button>

                            <button
                                onClick={(e) => {
                                    if (status === 'live') {
                                        setIsMenuOpen(false);
                                        handleDownload(e);
                                    } else {
                                        toast("File is being finalized... Please retry in 30 seconds.", { icon: '⏳' });
                                    }
                                }}
                                className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all active:scale-[0.98] group ${status === 'live' ? 'bg-color-accent/5 border-color-accent/20 text-white hover:bg-color-accent/10' : 'bg-white/5 border-transparent text-white/20'}`}
                            >
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${status === 'live' ? 'bg-color-accent/20 text-color-accent shadow-[0_0_20px_rgba(232,58,118,0.2)]' : 'bg-white/5 text-white/10'}`}>
                                    {status === 'live' ? <Download size={22} /> : <Clock size={22} className="animate-pulse" />}
                                </div>
                                <div className="text-left">
                                    <span className="block font-bold text-sm uppercase tracking-widest">{status === 'live' ? 'Download Payload' : 'Finalizing...'}</span>
                                    <span className="block text-[10px] text-color-support/40 mt-0.5 uppercase tracking-wider">Retrieve from protocol</span>
                                </div>
                            </button>

                            <div className="pt-2">
                                <button
                                    onClick={(e) => {
                                        setIsMenuOpen(false);
                                        handleDelete(e);
                                    }}
                                    className="w-full flex items-center gap-4 p-4 rounded-2xl bg-red-500/5 border border-red-500/10 text-red-500 active:bg-red-500/10 active:scale-[0.98] transition-all group"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(239,68,68,0.1)]">
                                        <Trash2 size={22} />
                                    </div>
                                    <div className="text-left">
                                        <span className="block font-bold text-sm uppercase tracking-widest text-red-400">Terminal Delete</span>
                                        <span className="block text-[10px] text-red-500/40 mt-0.5 uppercase tracking-wider">Permanently remove from vault</span>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

