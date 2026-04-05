"use client";

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Lock, FileText, LayoutGrid, Image as ImageIcon, Database, Link as LinkIcon, Download, PackageOpen, Loader2, CheckCircle2, Clock, Search, Trash2, Key, RefreshCw, MoreVertical, Eye, PlusCircle, ShieldCheck, Globe, Video, Music, FileSpreadsheet, Presentation, Archive, File as FileGeneral, Code2, BookOpen, UploadCloud, Tag } from 'lucide-react';
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
    const { account, connected, signAndSubmitTransaction, wallet } = useWallet();
    const shelbyClient = useShelbyClient();
    const [assets, setAssets] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [optimisticAssets, setOptimisticAssets] = useState<any[]>([]);
    const [isClient, setIsClient] = useState(false);
    const { ensureKey, encryptionKey, importKeyManual, lockVault } = useVaultKey();

    // Effect for hydration
    useEffect(() => {
        setIsClient(true);
        const saved = localStorage.getItem('soobinvault_optimistic_assets');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const now = Date.now();
                // Filter out assets older than 30 minutes (network indexing can be slow)
                const fresh = parsed.filter((a: any) => (now - (a.timestamp || 0)) < 1800000); // 1,800,000ms = 30 mins
                setOptimisticAssets(fresh);
            } catch (e) {
                console.error("Failed to parse optimistic assets from localStorage", e);
            }
        }
    }, []);

    // Effect to save optimistic assets to localStorage
    useEffect(() => {
        if (!isClient) return;
        localStorage.setItem('soobinvault_optimistic_assets', JSON.stringify(optimisticAssets));
    }, [optimisticAssets, isClient]);

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
        isEncrypted: boolean;
    } | null>(null);

    const [decryptedNames, setDecryptedNames] = useState<Record<string, string>>({});
    const [currentCategory, setCurrentCategory] = useState<string>('All');

    // Compute unified assets, counts and filtered list
    const { combinedAssets, filteredAssets, counts } = React.useMemo(() => {
        const sortedReal = [...assets].sort((a, b) => {
            const timeA = a.timestamp || a.creationMicros || a.createdAt || a.indexedAt || a.indexed_at || a.block_timestamp || 0;
            const timeB = b.timestamp || b.creationMicros || b.createdAt || b.indexedAt || b.indexed_at || b.block_timestamp || 0;
            if (timeA && timeB) return Number(timeB) - Number(timeA);
            return 0;
        });

        // Dedup assets
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

        // Calculate counts and perform filtering
        const all = combined.length;
        let imagesCount = 0, videosCount = 0, docsCount = 0;

        const filtered = combined.filter(asset => {
            const assetHash = asset.blob_merkle_root || asset.merkle_root || asset.merkleRoot || asset.hash || asset.blob_hash || asset.blob_id || asset.blobId || (asset.metadata && (asset.metadata.blob_merkle_root || asset.metadata.merkle_root || asset.metadata.hash)) || '';
            const nameStr = typeof asset.name === 'string' ? asset.name : '';
            const nameMatch = nameStr.match(/^@([^/]+)\/(.+)$/);
            let nameOnly = nameMatch ? nameMatch[2] : (asset.blobNameSuffix || nameStr);
            
            // Strip sv_market prefix for display if present
            if (nameOnly.startsWith('sv_market::')) {
                const parts = nameOnly.split('::');
                nameOnly = parts[parts.length - 1];
            }

            const decryptedName = decryptedNames[nameOnly];
            const nameToSearch = decryptedName || nameOnly || '';
            const fileType = getFileType(nameToSearch);

            // Update category counts
            if (fileType.isImage) imagesCount++;
            else if (fileType.isVideo) videosCount++;
            else if (fileType.isDocument) docsCount++;

            // Apply category filter
            if (currentCategory === 'Image' && !fileType.isImage) return false;
            if (currentCategory === 'Video' && !fileType.isVideo) return false;
            if (currentCategory === 'Document' && !fileType.isDocument) return false;

            // Apply search query filter
            const query = (searchQuery || '').toLowerCase().trim();
            if (!query) return true;

            const matchesName = String(nameToSearch).toLowerCase().includes(query);
            const matchesHash = assetHash && String(assetHash).toLowerCase().includes(query);

            return matchesName || matchesHash;
        });

        return {
            combinedAssets: combined,
            filteredAssets: filtered,
            counts: { all, images: imagesCount, videos: videosCount, docs: docsCount }
        };
    }, [assets, optimisticAssets, decryptedNames, searchQuery, currentCategory]);

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
        const MARKETPLACE_REGISTRY_ADDRESS = "0xaf41289b3141c2b8f5650dda1ae3fc400270048da3c009e087694d082bdcc263";

        try {
            toast.loading(`Deleting ${selectedAsset.name}...`, { id: 'delete-blob-modal' });

            // If it's a marketplace listing, delist it from the smart contract first!
            if (nameSuffix.startsWith('sv_market::')) {
                toast.loading(`Delisting from Marketplace registry...`, { id: 'delete-blob-modal' });
                try {
                    await signAndSubmitTransaction({
                        sender: account.address,
                        data: {
                            function: `${MARKETPLACE_REGISTRY_ADDRESS}::marketplace::delist_dataset`,
                            functionArguments: [nameSuffix]
                        }
                    });
                } catch (err) {
                    console.warn("[Dashboard] Marketplace delist aborted or already delisted:", err);
                }
                toast.loading(`Purging file from storage nodes...`, { id: 'delete-blob-modal' });
            }

            await deleteBlobs.mutateAsync({
                signer: {
                    account: account.address.toString(),
                    signAndSubmitTransaction: (tx: any) => {
                        console.log("[Shelby] Deletion request signature:", tx);
                        const { sequence_number, ...cleanTx } = tx;

                        const isSocialLogin = wallet?.name === 'Aptos Connect' || (account as any)?.wallet?.name === 'Aptos Connect';
                        const finalTx = isSocialLogin ? cleanTx : { ...cleanTx, sender: undefined };

                        return signAndSubmitTransaction(finalTx);
                    },
                } as any,
                blobNames: [nameSuffix]
            });

            toast.success(`${selectedAsset.name} successfully removed from vault.`, { id: 'delete-blob-modal' });

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

            console.log(`[Dashboard] Fetched ${blobs?.length || 0} blobs from network:`, blobs);

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
                    timestamp: e.detail.timestamp || Date.now(),
                    isEncrypted: e.detail.isEncrypted,
                    isOptimistic: true,
                    status: 'syncing'
                };
                setOptimisticAssets(prev => {
                    // Avoid duplicates in optimistic state
                    const exists = prev.some(a => a.transaction_hash === newAsset.transaction_hash || a.name === newAsset.name);
                    if (exists) return prev;
                    return [newAsset, ...prev];
                });
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

                <div className="assets-container p-0 md:p-0 overflow-hidden border-none bg-transparent md:bg-[#0A0A0A]/60 md:backdrop-blur-3xl rounded-[2.5rem] max-w-4xl mx-auto md:shadow-2xl relative">

                    {/* Integrated Desktop Header (Search & Tabs) */}
                    <div className="hidden md:block mx-6 pt-10 pb-0">
                        {/* Elegant Search Bar */}
                        <div className="relative mb-8 group/search">
                            <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-color-support/40 group-focus-within/search:text-color-primary transition-colors">
                                <Search size={20} />
                            </div>
                            <input
                                type="text"
                                placeholder="Search your assets..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-[#0A0A0A]/60 border border-white/5 rounded-2xl py-5 pl-16 pr-16 text-white text-lg outline-none focus:border-color-primary/30 focus:ring-1 focus:ring-color-primary/20 focus:bg-[#0A0A0A] transition-all placeholder:text-color-support/20 font-medium shadow-inner"
                            />
                            <button
                                onClick={() => fetchBlobs()}
                                disabled={isLoading}
                                className={`absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/5 border border-white/10 text-color-support/40 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center group/sync ${isLoading ? 'opacity-50' : ''}`}
                                title="Refresh Records"
                            >
                                <RefreshCw size={18} className={`transition-transform duration-1000 ${isLoading ? 'animate-spin' : 'group-hover/sync:rotate-180'}`} />
                            </button>
                        </div>

                        {/* Filter Tabs with Icons & Counts */}
                        <div className="flex items-center justify-center gap-20 border-b border-white/5">
                            {[
                                { id: 'All', icon: LayoutGrid, count: counts.all },
                                { id: 'Image', icon: ImageIcon, count: counts.images },
                                { id: 'Video', icon: Video, count: counts.videos },
                                { id: 'Document', icon: FileText, count: counts.docs }
                            ].map((tab) => {
                                const isActive = currentCategory === tab.id;
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => {
                                            setCurrentCategory(tab.id);
                                            // Reset search query if clicking categories to avoid conflict unless searching
                                            if (searchQuery && !['image', 'video', 'document'].includes(searchQuery.toLowerCase())) {
                                                // Keep search query if it's text, but if it was a category chip reset it
                                            }
                                        }}
                                        className={`relative pb-6 flex items-center gap-3 group transition-all ${isActive ? 'text-color-primary' : 'text-color-support/40 hover:text-white'}`}
                                    >
                                        <Icon size={18} className={`${isActive ? 'text-color-primary' : 'text-color-support/30 group-hover:text-white/60'}`} />
                                        <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                                            {tab.id} <span className="opacity-40 font-mono ml-1">({tab.count})</span>
                                        </span>
                                        {isActive && (
                                            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r from-color-primary to-color-accent rounded-full shadow-[0_0_15px_rgba(232,58,118,0.5)]" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Table Header (Desktop Only) */}
                    <div className="hidden md:grid grid-cols-12 gap-4 mx-6 px-10 py-6 border-b border-white/5 text-color-support/30 text-[10px] font-bold uppercase tracking-[0.25em] bg-black/20 rounded-t-2xl">
                        <div className="col-span-5">Asset Name</div>
                        <div className="col-span-2 text-center">Capacity</div>
                        <div className="col-span-2 text-center">Status</div>
                        <div className="col-span-3 text-center">Actions</div>
                    </div>

                    {/* Asset Rows/List */}
                    <div className="md:divide-y md:divide-white/5 min-h-[200px] md:max-w-none max-w-2xl mx-auto divide-y divide-white/5 bg-[#0D0D0D]/40 border border-white/5 rounded-2xl md:rounded-t-none md:rounded-b-2xl relative shadow-2xl mx-6 mb-10 mt-2 md:mx-6 md:mb-10 md:mt-0 overflow-hidden">
                        {!account ? (
                            <div className="p-12 text-center text-color-support/60 flex flex-col items-center">
                                <Lock size={48} className="mb-4 opacity-50" />
                                <p>Connect your Petra Wallet to view your secure Vault.</p>
                            </div>
                        ) : isLoading && assets.length === 0 ? (
                            <div className="p-12 text-center text-color-support flex flex-col items-center">
                                <div className="w-8 h-8 rounded-full border-t-2 border-b-2 border-color-primary animate-spin mb-4" />
                                <p>Decrypting records and fetching from network nodes...</p>
                            </div>
                        ) : assets.length === 0 && optimisticAssets.length === 0 ? (
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
                            filteredAssets.length === 0 && (searchQuery || '').trim() !== '' ? (
                                <div className="p-16 text-center flex flex-col items-center justify-center opacity-70 w-full animate-in fade-in duration-500">
                                    <Search size={48} className="mb-4 opacity-30 text-white" />
                                    <p className="text-color-support/60 text-lg">No assets found matching <span className="text-white font-bold">"{searchQuery}"</span></p>
                                </div>
                            ) : (
                                filteredAssets.map((asset, index) => {
                                    const nameStr = typeof asset.name === 'string' ? asset.name : '';
                                    const nameMatch = nameStr.match(/^@([^/]+)\/(.+)$/);
                                    let nameOnly = nameMatch ? nameMatch[2] : (asset.blobNameSuffix || nameStr);
                                    const fullNameForLink = nameOnly; // We need this for the download URL

                                    // Strip sv_market prefix for display
                                    const isMarketAsset = nameOnly.startsWith('sv_market::');
                                    if (isMarketAsset) {
                                        const parts = nameOnly.split('::');
                                        nameOnly = parts[parts.length - 1];
                                    }

                                    const decryptedName = decryptedNames[nameOnly];
                                    const displayName: string = decryptedName || nameOnly;
                                    const sizeMB = (asset.size / (1024 * 1024)).toFixed(2);
                                    const fileInfo = getFileType(displayName);
                                    const isImg = fileInfo.isImage;
                                    const isVid = fileInfo.isVideo;
                                    const isTxt = fileInfo.isText;
                                    const isAudio = fileInfo.isAudio;
                                    const isDocument = fileInfo.isDocument;

                                    const identifier = nameMatch ? nameMatch[1] : (account?.address?.toString() || '');
                                    const isEncrypted = nameOnly.endsWith('.vault');

                                    if (index === 0 || !isEncrypted) {
                                        console.log(`[Dashboard] processing asset ${index}:`, {
                                            displayName,
                                            isEncrypted,
                                            sizeMB,
                                            type: fileInfo
                                        });
                                    }
                                    // Ensure the identifier has the 0x prefix if it appears to be a raw hex address
                                    let finalIdentifier = identifier;
                                    const isHex = /^[0-9a-fA-F]+$/.test(finalIdentifier);
                                    if (finalIdentifier && !finalIdentifier.startsWith('0x') && isHex && finalIdentifier.length >= 60) {
                                        finalIdentifier = `0x${finalIdentifier}`;
                                    }

                                    // Construct the download URL with strict encoding for both parts, but allowing slashes to remain literal for paths
                                    const rpcBaseUrl = shelbyClient.baseUrl;
                                    const downloadUrl = (finalIdentifier && fullNameForLink)
                                        ? `${rpcBaseUrl}/v1/blobs/${encodeURIComponent(finalIdentifier)}/${fullNameForLink.split('/').map((segment: string) => encodeURIComponent(segment)).join('/')}`
                                        : null;

                                    if (index === 0) {
                                        console.log(`[Debug] URL Construction for ${displayName}:`, {
                                            rawIdentifier: identifier,
                                            finalIdentifier,
                                            fullNameForLink,
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
                                    const handleOpenPreviewLocal = () => {
                                        setSelectedAsset({
                                            name: displayName,
                                            url: downloadUrl || '',
                                            sizeStr: sizeMB,
                                            isImage: isImg,
                                            isVideo: isVid,
                                            isText: isTxt,
                                            isAudio: !!displayName.toLowerCase().match(/\.(mp3|wav|ogg|flac|aac|m4a|opus|wma)$/),
                                            isDocument: !!displayName.toLowerCase().match(/\.(doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|rtf|epub|pages|numbers|key|zip|rar|7z|gz|tar)$/),
                                            hash: assetHash,
                                            txHash: txHash,
                                            blobAccount: finalIdentifier,
                                            blobName: fullNameForLink,
                                            isEncrypted,
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
                                            isAudio={isAudio}
                                            isDocument={isDocument}
                                            fileInfo={fileInfo}
                                            isEncrypted={isEncrypted}
                                            downloadUrl={downloadUrl}
                                            blobAccount={finalIdentifier}
                                            blobName={fullNameForLink}
                                            handleOpenPreview={handleOpenPreviewLocal}
                                            assetHash={assetHash}
                                            txHash={txHash}
                                            deleteBlobs={deleteBlobs}
                                            fetchBlobs={fetchBlobs}
                                            signAndSubmitTransaction={signAndSubmitTransaction}
                                            wallet={wallet}
                                            account={account}
                                            shelbyClient={shelbyClient}
                                            setOptimisticDeletions={setOptimisticAssets}
                                        />
                                    );
                                })
                            )
                        )}
                    </div>

                    <div className="pb-8" />
                </div>
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
                isEncrypted={selectedAsset?.isEncrypted ?? true}
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

function AssetRow({ asset, index, displayName, sizeMB, isImg, isVid, isTxt, isAudio, isDocument, fileInfo, isEncrypted, downloadUrl, blobAccount, blobName, handleOpenPreview, assetHash, txHash, deleteBlobs, fetchBlobs, signAndSubmitTransaction, wallet, account, shelbyClient, setOptimisticDeletions }: any): React.ReactNode {
    const { ensureKey, encryptionKey } = useVaultKey();
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

        const downloadToastId = toast.loading(isEncrypted ? `Decrypting ${displayName}...` : `Downloading ${displayName}...`);

        try {
            let buffer: ArrayBuffer;

            if (isEncrypted && blobAccount && blobName) {
                // Use SDK for encrypted files to ensure proper protocol handling
                const shelbyBlob = await shelbyClient.download({
                    account: blobAccount,
                    blobName: blobName
                });

                const reader = shelbyBlob.readable.getReader();
                const chunks: Uint8Array[] = [];
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                }
                const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
                const rawBuffer = new Uint8Array(totalLength);
                let offset = 0;
                for (const chunk of chunks) {
                    rawBuffer.set(chunk, offset);
                    offset += chunk.length;
                }
                buffer = rawBuffer.buffer;
            } else {
                const apiKey = shelbyClient.rpc.apiKey || process.env.NEXT_PUBLIC_SHELBY_API_KEY || "aptoslabs_8nf7TvDNviM_BvorzGpZdTDDZPsPpPorTcctVeD9F45Fu";
                const response = await fetch(downloadUrl!, {
                    headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
                });

                if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
                buffer = await response.arrayBuffer();
            }

            console.log(`[Dashboard] Download fetched buffer for ${displayName}. Size: ${buffer.byteLength} bytes.`);

            if (buffer.byteLength === 0) {
                toast.error("File content is empty. It may still be indexing or the upload was interrupted.", { id: downloadToastId, duration: 5000 });
                return;
            }

            if (isEncrypted) {
                // --- ENCRYPTED: need to decrypt first ---
                if (buffer.byteLength < 28) {
                    toast.error("Encrypted data is too small or corrupted.", { id: downloadToastId });
                    return;
                }
                const cryptoKey = await ensureKey();
                if (!cryptoKey) {
                    toast.error("Decryption key required for download.", { id: downloadToastId });
                    return;
                }
                const { blob, metadata } = await decryptFile(buffer, cryptoKey);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = metadata.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                // --- PLAINTEXT: direct download ---
                const blob = new Blob([buffer]);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = displayName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }

            toast.success('Downloaded!', { id: downloadToastId });
        } catch (err) {
            console.error('Download failed:', err);
            toast.error(isEncrypted ? 'Failed to decrypt and download.' : 'Failed to download.', { id: downloadToastId });
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

            // If it's a marketplace asset, also delist it from the smart contract!
            if (nameSuffix.startsWith('sv_market::')) {
                const MARKETPLACE_REGISTRY_ADDRESS = "0xaf41289b3141c2b8f5650dda1ae3fc400270048da3c009e087694d082bdcc263";
                try {
                    console.log(`[Marketplace] Attempting to delist ${nameSuffix} from Smart Contract...`);
                    await signAndSubmitTransaction({
                        sender: account?.address.toString(),
                        data: {
                            function: `${MARKETPLACE_REGISTRY_ADDRESS}::marketplace::delist_dataset`,
                            functionArguments: [nameSuffix]
                        }
                    });
                    console.log(`[Marketplace] Successfully delisted from smart contract!`);
                } catch (contractErr) {
                    console.warn("[Marketplace] Failed to delist from contract (may already be delisted or user cancelled):", contractErr);
                    // Do not strictly abort if this fails, they might still want it deleted from Shelby storage
                }
            }

            await deleteBlobs.mutateAsync({
                signer: {
                    account: account?.address.toString() || "",
                    signAndSubmitTransaction: (tx: any) => {
                        console.log("[Shelby] Deletion request signature:", tx);
                        const { sequence_number, ...cleanTx } = tx;

                        const isSocialLogin = wallet?.name === 'Aptos Connect' || (account as any)?.wallet?.name === 'Aptos Connect';
                        const finalTx = isSocialLogin ? cleanTx : { ...cleanTx, sender: undefined };

                        return signAndSubmitTransaction(finalTx);
                    },
                } as any,
                blobNames: [nameSuffix]
            });

            toast.success(`${displayName} successfully removed from vault.`, { id: 'delete-blob' });

            // Wait for 3 seconds before refreshing to ensure the network has finalized the state
            setTimeout(() => {
                fetchBlobs();
            }, 3000);
        } catch (err) {
            console.error("Deletion failed:", err);
            toast.error(err instanceof Error ? err.message : "Failed to delete", { id: 'delete-blob' });
        }
    };


    const handleOpenPreviewLocal = () => {
        if (isEncrypted && !encryptionKey) {
            ensureKey(true);
            return;
        }
        handleOpenPreview();
    };

    return (
        <div
            className={`asset-row flex items-center justify-between md:grid md:grid-cols-12 gap-4 px-4 md:px-10 py-4 md:py-6 transition-all duration-500 relative overflow-hidden border-b border-white/5 last:border-0 hover:bg-white/[0.02] cursor-pointer group ${status !== 'live' ? 'opacity-80' : ''}`}
            onClick={handleOpenPreviewLocal}
        >
            {/* Hover Background Artifact */}
            <div className="absolute inset-0 bg-gradient-to-r from-color-primary/[0.01] via-transparent to-color-accent/[0.01] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

            {/* Asset Identity */}
            <div className="flex-1 min-w-0 md:col-span-5 flex items-center gap-5 relative z-10 pr-2 md:pr-0">
                <div className="w-14 h-14 rounded-2xl bg-[#080808] flex items-center justify-center shadow-xl group-hover:scale-105 group-hover:border-color-primary/30 transition-all duration-500 border border-white/5 shrink-0">
                    {isEncrypted && !encryptionKey ? (
                        <Lock className="text-color-primary animate-pulse" size={22} />
                    ) : isImg ? (
                        <ImageIcon className="text-yellow-500 group-hover:text-yellow-400 transition-colors" size={22} />
                    ) : isVid ? (
                        <Video className="text-purple-400 group-hover:text-purple-300 transition-colors" size={22} />
                    ) : isAudio ? (
                        <Music className="text-blue-400 group-hover:text-blue-300 transition-colors" size={22} />
                    ) : isDocument ? (
                        <FileText className="text-emerald-400 group-hover:text-emerald-300 transition-colors" size={22} />
                    ) : (
                        <FileGeneral className="text-color-support/40 transition-colors" size={22} />
                    )}
                </div>
                <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-white font-bold truncate text-base group-hover:text-color-primary transition-colors duration-300 ${isEncrypted && !encryptionKey ? 'blur-[5px] select-none opacity-50' : ''}`}>
                            {isEncrypted && !encryptionKey ? "Encrypted Vault Asset" : displayName}
                        </span>
                        {blobName.startsWith('sv_market::') && (
                            <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-[9px] font-black uppercase tracking-widest text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]">
                                <Tag size={10} className="fill-blue-400/20" />
                                On Sale
                            </span>
                        )}
                    </div>

                    {/* Mobile Subtitle (Size & Status) */}
                    <div className="flex items-center gap-2 mt-1.5 md:hidden">
                        <span className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-color-support/40 text-[9px] uppercase font-mono tracking-widest">
                            {sizeMB} MB
                        </span>
                        <span className="text-color-support/20 select-none">•</span>
                        {isEncrypted ? (
                            <span className={`text-[9px] font-black uppercase tracking-[0.15em] flex items-center gap-1.5 ${encryptionKey ? 'text-green-400' : 'text-color-primary'}`}>
                                {encryptionKey ? <ShieldCheck size={10} className="text-green-400" /> : <Lock size={10} className="text-color-primary" />}
                                {encryptionKey ? 'DECRYPTED' : 'LOCKED'}
                            </span>
                        ) : (
                            <span className="text-[9px] font-black uppercase tracking-[0.15em] flex items-center gap-1.5 text-yellow-500">
                                <Globe size={10} className="text-yellow-500" />
                                PUBLIC
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Capacity (Desktop Only) */}
            <div className="hidden md:flex md:col-span-2 relative z-10 justify-center">
                <div className="px-3 py-1 rounded-lg bg-white/5 border border-white/5 font-mono text-[11px] text-color-support/60 tracking-widest uppercase">
                    {sizeMB} MB
                </div>
            </div>

            {/* Status (Desktop Only) */}
            <div className="hidden md:flex md:col-span-2 relative z-10 justify-center">
                {isEncrypted ? (
                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] flex items-center gap-2 border ${encryptionKey ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-color-primary/10 border-color-primary/30 text-color-primary'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${encryptionKey ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-color-primary shadow-[0_0_8px_rgba(232,58,118,0.5)] animate-pulse'}`} />
                        {encryptionKey ? 'DECRYPTED' : 'LOCKED'}
                    </div>
                ) : (
                    <div className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] flex items-center gap-2 border bg-yellow-500/10 border-yellow-500/30 text-yellow-500">
                        <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
                        PUBLIC
                    </div>
                )}
            </div>

            {/* Actions (Desktop Only) */}
            <div className="hidden md:flex md:col-span-3 relative z-10 justify-center items-center gap-3">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (isEncrypted && !encryptionKey) {
                            ensureKey(true);
                            return;
                        }
                        if (status === 'live') {
                            handleDownload();
                        } else {
                            toast("File indexing...", { icon: '⏳' });
                        }
                    }}
                    className={`flex items-center justify-center p-2.5 rounded-xl transition-all shadow-lg group/download active:scale-95 ${isEncrypted && !encryptionKey
                            ? 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10'
                            : status === 'live'
                                ? 'bg-white/10 border border-white/20 text-white hover:bg-color-primary hover:border-color-primary hover:scale-[1.02] shadow-[0_0_20px_rgba(232,58,118,0.1)]'
                                : 'bg-white/5 text-color-support/20 opacity-50 cursor-not-allowed border border-white/5'
                        }`}
                    title="Download asset"
                >
                    <Download size={16} />
                </button>

                <button
                    onClick={handleDelete}
                    disabled={deleteBlobs.isPending}
                    className="flex items-center justify-center p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300 shadow-xl group/delete active:scale-95"
                    title="Permanently remove from vault"
                >
                    {deleteBlobs.isPending ? (
                        <Loader2 size={16} className="animate-spin" />
                    ) : (
                        <Trash2 size={16} />
                    )}
                </button>
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
                                {isEncrypted && !encryptionKey ? <Lock size={28} className="text-color-primary animate-pulse" /> : isImg ? <ImageIcon size={28} className="text-color-accent" /> : isVid ? <PackageOpen size={28} className="text-color-primary" /> : <FileText size={28} className="text-color-support" />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className={`text-white font-bold truncate text-xl leading-snug ${isEncrypted && !encryptionKey ? 'blur-[6px] select-none opacity-50' : ''}`}>
                                    {isEncrypted && !encryptionKey ? "Encrypted Asset" : displayName}
                                </h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="px-2 py-0.5 rounded-md bg-white/5 text-color-support/40 text-[10px] font-mono tracking-widest uppercase border border-white/5">
                                        {sizeMB} MB
                                    </span>
                                    <span className="text-color-support/20 text-[10px]">•</span>
                                    {isEncrypted ? (
                                        <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest ${encryptionKey ? 'text-green-400' : 'text-color-primary'}`}>
                                            <ShieldCheck size={10} /> {encryptionKey ? 'Decrypted' : 'Locked'}
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-yellow-400">
                                            <Globe size={10} /> Public
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={(e) => {
                                    setIsMenuOpen(false);
                                    if (isEncrypted && !encryptionKey) {
                                        ensureKey(true);
                                    } else {
                                        handleOpenPreview();
                                    }
                                }}
                                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 text-white active:bg-white/10 transition-all active:scale-[0.98] group"
                            >
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${isEncrypted && !encryptionKey ? 'bg-color-primary/10 text-color-primary' : 'bg-blue-500/10 text-blue-400'}`}>
                                    {isEncrypted && !encryptionKey ? <Lock size={22} /> : <Eye size={22} />}
                                </div>
                                <div className="text-left">
                                    <span className="block font-bold text-sm uppercase tracking-widest">{isEncrypted && !encryptionKey ? 'Unlock Asset' : 'Preview Asset'}</span>
                                    <span className="block text-[10px] text-color-support/40 mt-0.5 uppercase tracking-wider">{isEncrypted && !encryptionKey ? 'Authorize to view content' : 'Instant data visualization'}</span>
                                </div>
                            </button>

                            <button
                                onClick={(e) => {
                                    if (isEncrypted && !encryptionKey) {
                                        setIsMenuOpen(false);
                                        ensureKey(true);
                                        return;
                                    }
                                    if (status === 'live') {
                                        setIsMenuOpen(false);
                                        handleDownload(e);
                                    } else {
                                        toast("File is being finalized... Please retry in 30 seconds.", { icon: '⏳' });
                                    }
                                }}
                                className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all active:scale-[0.98] group ${isEncrypted && !encryptionKey ? 'bg-color-primary/5 border-color-primary/10 text-white' : status === 'live' ? 'bg-color-accent/5 border-color-accent/20 text-white hover:bg-color-accent/10' : 'bg-white/5 border-transparent text-white/20'}`}
                            >
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${isEncrypted && !encryptionKey ? 'bg-color-primary/20 text-color-primary shadow-[0_0_20px_rgba(232,58,118,0.2)]' : status === 'live' ? 'bg-color-accent/20 text-color-accent shadow-[0_0_20px_rgba(232,58,118,0.2)]' : 'bg-white/5 text-white/10'}`}>
                                    {isEncrypted && !encryptionKey ? <Lock size={22} /> : status === 'live' ? <Download size={22} /> : <Clock size={22} className="animate-pulse" />}
                                </div>
                                <div className="text-left">
                                    <span className="block font-bold text-sm uppercase tracking-widest">{isEncrypted && !encryptionKey ? 'Unlock & Download' : status === 'live' ? 'Download Payload' : 'Finalizing...'}</span>
                                    <span className="block text-[10px] text-color-support/40 mt-0.5 uppercase tracking-wider">{isEncrypted && !encryptionKey ? 'Decrypt session key' : 'Retrieve from protocol'}</span>
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

