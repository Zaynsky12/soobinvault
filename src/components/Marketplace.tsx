"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import gsap from 'gsap';
import {
    Search, BrainCircuit, Database, ShoppingCart, Filter,
    DownloadCloud, Banknote, ShieldAlert, Gift, LayoutGrid, List,
    ChevronDown, Lock, Zap, Globe, Cpu, Mic, BarChart2, FlaskConical,
    Stethoscope, Bot, Layers, Package, SortAsc, ArrowUpDown, Shield,
    ExternalLink
} from 'lucide-react';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Aptos, AptosConfig, Network, AccountAddress } from "@aptos-labs/ts-sdk";
import { useShelbyClient, useDeleteBlobs } from "@shelby-protocol/react";
import toast from 'react-hot-toast';

const CATEGORY_META: Record<string, { icon: React.ElementType; color: string; bg: string; border: string }> = {
    "NLP":             { icon: BrainCircuit, color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/30" },
    "Computer Vision": { icon: Cpu,          color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30" },
    "Audio":           { icon: Mic,          color: "text-pink-400",    bg: "bg-pink-500/10",    border: "border-pink-500/30" },
    "Sensors":         { icon: Zap,          color: "text-yellow-400",  bg: "bg-yellow-500/10",  border: "border-yellow-500/30" },
    "Finance":         { icon: BarChart2,    color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
    "Biology":         { icon: FlaskConical, color: "text-teal-400",    bg: "bg-teal-500/10",    border: "border-teal-500/30" },
    "Medical":         { icon: Stethoscope,  color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/30" },
    "Robotics":        { icon: Bot,          color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30" },
    "Multimodal":      { icon: Layers,       color: "text-indigo-400",  bg: "bg-indigo-500/10",  border: "border-indigo-500/30" },
    "Other":           { icon: Package,      color: "text-white/40",    bg: "bg-white/5",        border: "border-white/10" },
};

const MOCK_DATASETS: any[] = []; // Will be populated from registry

const aptosConfig = new AptosConfig({ network: Network.TESTNET });
const aptosClient = new Aptos(aptosConfig);

const SORT_OPTIONS = ["Most Downloaded", "Highest Rated", "Price: Low to High", "Price: High to Low", "Newest"];

export function Marketplace() {
    const { account, signAndSubmitTransaction, wallet } = useWallet();
    const shelbyClient = useShelbyClient();
    const deleteBlobs = useDeleteBlobs({ client: shelbyClient });
    const [datasets, setDatasets] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState("All");
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [sortBy, setSortBy] = useState("Most Downloaded");
    const [sortOpen, setSortOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadDatasets = async () => {
            setIsLoading(true);
            try {
                // Deep Indexer Discovery: Fetching extra fields like account_address to find the real physical bucket
                const query = `
                    query GetMarketplaceBlobs {
                        blobs(
                            where: {
                                _and: [
                                    { blob_name: { _ilike: "%sv_market::%" } },
                                    { is_deleted: { _eq: 0 } },
                                    { is_written: { _eq: 1 } }
                                ]
                            },
                            limit: 40,
                            order_by: { created_at: desc }
                        ) {
                            blob_name
                            owner
                            account_address
                            signer
                            size
                            created_at
                        }
                    }
                `;

                // Use the client's indexer directly to bypass SDK wrapper limitations
                const response = await (shelbyClient as any).indexer.query({ query });
                const blobs = response?.blobs || [];

                console.log("[Marketplace] Deep Indexer Discovery Result:", blobs);

                if (blobs.length > 0) {
                    const rawMapped = blobs.map((d: any) => {
                        const blobName = d.blob_name || "";
                        const parts = blobName.split('::');
                        
                        if (parts.length >= 5) {
                            const category = parts[1];
                            const price = parts[2];
                            const description = parts[3];
                            // Re-join remaining parts in case filename itself contains ::
                            const originalName = parts.slice(4).join('::');
                            
                            const ownerAddr = d.owner || d.account_address || d.signer || "0x...";
                            
                            // Capture ALL potential owner fields for the brute-force strategy
                            // We prioritize signer and account_address as they represent the physical storage bucket
                            const possibleOwners = [
                                d.signer,
                                d.account_address,
                                d.owner
                            ].filter(Boolean).map(a => a.toLowerCase());
                            
                            return {
                                id: blobName,
                                title: originalName,
                                description: description,
                                price: parseFloat(price) || 0,
                                size: d.size ? `${(parseInt(d.size) / 1024).toFixed(1)} KB` : "Stored Asset",
                                seller: `${ownerAddr.slice(0, 6)}...${ownerAddr.slice(-4)}`,
                                sellerFull: ownerAddr,
                                possibleOwners: Array.from(new Set(possibleOwners)),
                                category: category,
                                downloads: Math.floor(Math.random() * 50),
                                rating: 4.0 + Math.random(),
                                isFree: parseFloat(price) === 0,
                                tags: [category],
                                license: "Proprietary",
                                updatedAgo: "Active",
                            };
                        }
                        return null;
                    }).filter(Boolean);

                    console.log(`[Marketplace] Discovery complete. Found ${rawMapped.length} potential assets.`);
                    setDatasets(rawMapped);
                } else {
                    console.warn("[Marketplace] No datasets found with deep discovery.");
                    setDatasets([]);
                }
            } catch (err) {
                console.error("[Marketplace] Deep discovery error:", err);
                // Fallback to simple query if deep query fails on this indexer version
                try {
                    const fallback = await (shelbyClient as any).coordination.indexer.getBlobs({
                        where: { 
                            _and: [
                                { blob_name: { _regex: "sv_market" } },
                                { is_deleted: { _eq: 0 } }
                            ]
                        },
                        limit: 20
                    });
                    if (fallback?.blobs) {
                          setDatasets(fallback.blobs.map((d: any) => {
                              const name = d.blob_name || "Unknown Asset";
                              const parts = name.split('::');
                              
                              if (parts.length >= 5) {
                                  const category = parts[1];
                                  const price = parts[2];
                                  const description = parts[3];
                                  const originalName = parts.slice(4).join('::');
                                  const priceNum = parseFloat(price) || 0;
                                  
                                  return {
                                      id: name,
                                      title: originalName,
                                      description: description,
                                      price: priceNum,
                                      isFree: priceNum === 0,
                                      sellerFull: d.owner || d.account_address,
                                      possibleOwners: [d.owner, d.account_address].filter(Boolean),
                                      tags: [category],
                                      category: category,
                                      downloads: 0,
                                      rating: 5.0,
                                      updatedAgo: "Recently",
                                      size: d.size ? `${(parseInt(d.size) / 1024).toFixed(1)} KB` : "Stored Asset"
                                  };
                              }
                              
                              return {
                                  id: name,
                                  title: name.split('::').pop() || name,
                                  description: "Marketplace asset",
                                  price: 0,
                                  isFree: true,
                                  sellerFull: d.owner,
                                  possibleOwners: [d.owner],
                                  tags: ["Dataset"],
                                  category: "Other",
                                  downloads: 0,
                                  rating: 5.0,
                                  updatedAgo: "Recently",
                                  size: d.size ? `${(parseInt(d.size) / 1024).toFixed(1)} KB` : "Stored Asset"
                              };
                          }));
                    }
                } catch (fallbackErr) {
                    setDatasets([]);
                }
            } finally {
                setIsLoading(false);
            }
        };

        loadDatasets();
    }, [shelbyClient]);

    // 'showFreeOnly' is derived from activeCategory for a unified single-pill UX
    const showFreeOnly = activeCategory === "Free";
    const showMyListings = activeCategory === "My Listings";
    const categories = ["All", "My Listings", "Free", "NLP", "Computer Vision", "Audio", "Sensors", "Finance", "Biology", "Medical", "Robotics", "Multimodal", "Other"];

    const filteredDatasets = useMemo(() =>
        datasets
            .filter(ds => {
                const isOwner = ds.sellerFull?.toLowerCase() === account?.address.toString().toLowerCase();
                const categoryMatch = (activeCategory === "All" || activeCategory === "My Listings" || activeCategory === "Free" || ds.category === activeCategory);
                const freeMatch = (activeCategory !== "Free" || ds.isFree);
                const ownMatch = (activeCategory !== "My Listings" || isOwner);
                const searchMatch = (
                    ds.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    ds.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (ds.tags && ds.tags.some((t: string) => t.toLowerCase().includes(searchQuery.toLowerCase())))
                );
                return categoryMatch && freeMatch && ownMatch && searchMatch;
            })
            .sort((a, b) => {
                if (sortBy === "Most Downloaded") return b.downloads - a.downloads;
                if (sortBy === "Highest Rated") return b.rating - a.rating;
                if (sortBy === "Price: Low to High") return a.price - b.price;
                if (sortBy === "Price: High to Low") return b.price - a.price;
                return 0;
            }),
    [datasets, activeCategory, searchQuery, sortBy]
    );

    useEffect(() => {
        // Kill any in-progress tweens on cards first to prevent stacking
        gsap.killTweensOf(".dataset-card");
        const cards = document.querySelectorAll(".dataset-card");
        if (cards.length === 0) return;
        gsap.fromTo(cards,
            { y: 16, opacity: 0 },
            { y: 0, opacity: 1, stagger: 0.05, duration: 0.4, ease: "power2.out", overwrite: true }
        );
    }, [filteredDatasets, viewMode]);




    const handlePurchase = async (dataset: any) => {
        if (!account || !signAndSubmitTransaction) { 
            toast.error("Please connect your wallet first."); 
            return; 
        }
        
        // SUSD Asset Address for Shelby Testnet
        const SUSD_METADATA_ADDR = "0x85fdb9a176ab8ef1d9d9c1b60d60b3924f0800ac1de1cc2085fb0b8bb4988e6a";

        const actionToastId = toast.loading(dataset.isFree ? `Fetching ${dataset.title}...` : `Initializing purchase for ${dataset.title}...`);

        try {
            if (dataset.price > 0) {
                // 1. Transaction to pay the seller
                const response = await signAndSubmitTransaction({
                    sender: account.address,
                    data: {
                        function: "0x1::primary_fungible_store::transfer",
                        typeArguments: ["0x1::fungible_asset::Metadata"],
                        functionArguments: [
                            SUSD_METADATA_ADDR,
                            dataset.sellerFull,
                            Math.floor(dataset.price * 100_000_000)
                        ]
                    }
                });
                console.log("[Marketplace] Purchase transaction success:", response);
                toast.loading(`Payment confirmed! Now downloading ${dataset.title}...`, { id: actionToastId });
            }

            // 2. Fetch from Shelby Network (Primary: SDK, Fallback: SUPER Brute Force "Final Hammer")
            console.log(`[Marketplace] Starting FINAL HAMMER brute-force for: ${dataset.id}`);
            
            let chunks: Uint8Array[] = [];
            const rpcBaseUrl = (shelbyClient as any).config?.rpc?.baseUrl || 
                             (shelbyClient as any).rpc?.config?.baseUrl || 
                             (shelbyClient as any).baseUrl || 
                             "https://api.testnet.shelby.xyz/shelby";

            const apiKey = (shelbyClient as any).config?.rpc?.apiKey || 
                         (shelbyClient as any).rpc?.apiKey || 
                         process.env.NEXT_PUBLIC_SHELBY_API_KEY || 
                         "aptoslabs_8nf7TvDNviM_BvorzGpZdTDDZPsPpPorTcctVeD9F45Fu";

            // Permutation Data
            const originalName = dataset.id.split('::').pop() || dataset.id;
            const namesToTry = [dataset.id, originalName];
            
            // Addresses to try: All possible owners from indexer + Current User + System Protocol
            const addressesToTry: string[] = Array.from(new Set([
                ...(dataset.possibleOwners || []),
                dataset.sellerFull,
                account?.address.toString(),
                "0x1",
                "0x0"
            ].filter(Boolean))).map(a => a?.toLowerCase().startsWith('0x') ? a.toLowerCase() : `0x${a.toLowerCase()}`);

            let success = false;
            let lastError: string = "No attempts made";

            // SUPER PERMUTATION LOOP
            for (const addr of addressesToTry) {
                if (success) break;
                for (const name of namesToTry) {
                    if (success) break;

                    console.log(`[Marketplace] FINAL HAMMER attempting: Addr=${addr}, Name=${name}`);

                    // Strategy A: SDK
                    try {
                        const shelbyBlob = await (shelbyClient as any).download({
                            account: AccountAddress.from(addr),
                            blobName: name
                        });
                        const reader = shelbyBlob.readable.getReader();
                        const currentChunks: Uint8Array[] = [];
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            if (value) currentChunks.push(value);
                        }
                        if (currentChunks.length > 0) { chunks = currentChunks; success = true; break; }
                    } catch (e) { /* silent fail for brute force */ }

                    // Strategy B: Fetch - Standard Blobs (Encoded)
                    try {
                        const encodedAddr = encodeURIComponent(addr);
                        const encodedName = name.split('/').map((s: string) => encodeURIComponent(s)).join('/');
                        // Pattern 1: Standard
                        const url1 = `${rpcBaseUrl}/v1/blobs/${encodedAddr}/${encodedName}`;
                        // Pattern 2: Public (Crucial for Marketplace)
                        const url2 = `${rpcBaseUrl}/v1/public/blobs/${encodedAddr}/${encodedName}`;
                        
                        const urls = [url1, url2];
                        for (const url of urls) {
                            const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey.trim()}` } });
                            if (resp.ok) {
                                const buffer = await resp.arrayBuffer();
                                chunks = [new Uint8Array(buffer)];
                                success = true; 
                                console.log(`[Marketplace] SUCCESS via Fetch! URL: ${url}`);
                                break;
                            }
                        }
                        if (success) break;
                    } catch (e) {}

                    // Strategy C: Fetch - Literal (::) and Double Encoded
                    try {
                        const encodedAddr = encodeURIComponent(addr);
                        const encodedName = encodeURIComponent(encodeURIComponent(name));
                        const urlLiteral = `${rpcBaseUrl}/v1/public/blobs/${encodedAddr}/${name}`;
                        const urlDouble = `${rpcBaseUrl}/v1/public/blobs/${encodedAddr}/${encodedName}`;
                        
                        const urls = [urlLiteral, urlDouble];
                        for (const url of urls) {
                            const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey.trim()}` } });
                            if (resp.ok) {
                                const buffer = await resp.arrayBuffer();
                                chunks = [new Uint8Array(buffer)];
                                success = true; 
                                console.log(`[Marketplace] SUCCESS via Public Spec! URL: ${url}`);
                                break;
                            }
                        }
                        if (success) break;
                    } catch (e) {}
                }
            }

            if (!success) {
                lastError = `Tried ${addressesToTry.length * namesToTry.length * 5} combinations across Standard and Public routes and all 404'd.`;
                throw new Error(`FINAL HAMMER: All download strategies exhausted. This file may not have been fully indexed or exists on a different node. Details: ${lastError}`);
            }

            if (!success) {
                lastError = `Tried ${addressesToTry.length * namesToTry.length * 5} combinations and all 404'd.`;
                throw new Error(`FINAL HAMMER: All download strategies exhausted. This file may not have been fully indexed or exists on a different node. Details: ${lastError}`);
            }

            if (!success) {
                throw new Error(`All download strategies exhausted. Last error: ${lastError}. Please try again later or check if the file is still indexing.`);
            }

            if (chunks.length === 0) throw new Error("File empty or not found on storage nodes.");

            const fileBlob = new Blob(chunks as any);
            const url = URL.createObjectURL(fileBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = dataset.title;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.success(`Download successful!`, { id: actionToastId });
            window.dispatchEvent(new CustomEvent('dataset:purchased', { detail: { id: dataset.id } }));

        } catch (err: any) {
            console.error("[Marketplace] Action failed:", err);
            toast.error(`Failed: ${err.message || 'Transaction rejected or network error'}`, { id: actionToastId });
        }
    };

    const getCategoryMeta = (cat: string) => CATEGORY_META[cat] ?? CATEGORY_META["Other"];

    /* ── LIST ROW ── */
    const ListRow = ({ dataset, idx }: { dataset: any; idx: number }) => {
        const meta = getCategoryMeta(dataset.category);
        const Icon = meta.icon;
        return (
            <div className="dataset-card group flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 sm:py-5 border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-all duration-200 cursor-default">

                {/* Category Icon */}
                <div className="flex items-center gap-3 sm:block">
                    <div className={`shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center ${meta.bg} border ${meta.border}`}>
                        <Icon size={16} className={meta.color} />
                    </div>
                </div>

                {/* Main Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className={`text-sm md:text-base font-bold text-white group-hover:text-blue-300 transition-colors truncate max-w-[120px] xs:max-w-[200px] sm:max-w-none`}>
                            {dataset.title}
                        </h3>
                    </div>
                    <p className="text-xs text-white/40 leading-relaxed line-clamp-1 mb-2">{dataset.description}</p>
                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                        {dataset.tags?.map((tag: string) => (
                            <span key={tag} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-white/40 font-medium">
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Meta stats — hidden on mobile, visible md+ */}
                <div className="hidden lg:flex items-center gap-6 text-xs text-white/30 font-mono shrink-0">
                    <span className="flex items-center gap-1.5 w-20 justify-end">
                        <Database size={12} />{dataset.size}
                    </span>
                    <span className="flex items-center gap-1.5 w-16 justify-end">
                        <DownloadCloud size={12} />{dataset.downloads}
                    </span>
                    <span className="flex items-center gap-1.5 w-20 text-[10px] justify-end text-white/20">
                        <Shield size={11} className="text-blue-400/50" />
                        On-chain
                    </span>
                </div>

                {/* Price + Action */}
                <div className="shrink-0 flex items-center justify-between sm:justify-end gap-3 sm:ml-2 mt-3 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-0 border-white/5">
                    {/* Delete Listing Button (Owner only) */}

                    
                    <div className="sm:text-right">
                        {dataset.isFree ? (
                            <span className="text-sm font-black text-green-400">FREE</span>
                        ) : (
                            <div className="flex items-baseline gap-1 sm:justify-end">
                                <span className="text-base font-black text-white">{dataset.price.toFixed(1)}</span>
                                <span className="text-[9px] font-bold text-indigo-400 tracking-widest">SUSD</span>
                            </div>
                        )}
                        <p className="text-[9px] text-white/20 mt-0.5">{dataset.updatedAgo}</p>
                    </div>
                    <button
                        onClick={() => handlePurchase(dataset)}
                        className={`px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all duration-300 flex items-center gap-1.5 shrink-0 ${
                            dataset.isFree
                                ? 'bg-white/8 text-white/70 hover:bg-white/15 border border-white/10'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] border border-blue-400/30 hover:scale-105 active:scale-95'
                        }`}
                    >
                        <ShoppingCart size={13} />
                        {dataset.isFree ? 'Download' : 'Purchase'}
                    </button>
                </div>
            </div>
        );
    };

    /* ── GRID CARD ── */
    const GridCard = ({ dataset }: { dataset: any }) => {
        const meta = getCategoryMeta(dataset.category);
        const Icon = meta.icon;
        return (
            <div className="dataset-card group bg-[#090e1c]/90 border border-white/8 hover:border-blue-500/30 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-[0_12px_40px_rgba(59,130,246,0.12)] flex flex-col">
                {/* Top bar */}
                <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-white/5">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${meta.bg} border ${meta.border}`}>
                        <Icon size={14} className={meta.color} />
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.color}`}>{dataset.category}</span>
                    </div>
                </div>
                {/* Body */}
                <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors leading-snug">{dataset.title}</h3>
                    </div>
                    <p className="text-xs text-white/35 leading-relaxed line-clamp-2 mb-4 flex-1">{dataset.description}</p>
                    <div className="flex flex-wrap gap-1 mb-4">
                        {dataset.tags?.map((tag: string) => (
                            <span key={tag} className="text-[9px] px-2 py-0.5 rounded-md bg-white/5 text-white/30 border border-white/5">{tag}</span>
                        ))}
                    </div>
                    {/* Stats */}
                    <div className="flex items-center justify-between text-[11px] text-white/30 font-mono mb-4 border-t border-white/5 pt-3">
                        <span className="flex items-center gap-1"><Database size={11} />{dataset.size}</span>
                        <span className="flex items-center gap-1"><DownloadCloud size={11} />{dataset.downloads}</span>
                        <span className="flex items-center gap-1 text-blue-400/50"><Shield size={11} />On-chain</span>
                    </div>
                    {/* Action */}
                    <div className="flex items-center justify-between gap-2">
                        {/* Delete Listing Button (Owner only) */}


                        <div className="flex-1">
                            {dataset.isFree ? (
                                <span className="text-sm font-black text-green-400">FREE</span>
                            ) : (
                                <div className="flex items-baseline gap-1">
                                    <span className="text-lg font-black text-white">{dataset.price.toFixed(1)}</span>
                                    <span className="text-[9px] font-bold text-indigo-400 tracking-widest">SUSD</span>
                                </div>
                            )}
                            <p className="text-[9px] text-white/20">{dataset.updatedAgo}</p>
                        </div>
                        <button
                            onClick={() => handlePurchase(dataset)}
                            className={`px-5 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all duration-300 flex items-center gap-1.5 ${
                                dataset.isFree
                                    ? 'bg-white/8 text-white/70 hover:bg-white/15 border border-white/10'
                                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-[0_0_15px_rgba(59,130,246,0.5)] border border-blue-400/30 hover:scale-105 active:scale-95'
                            }`}
                        >
                            <ShoppingCart size={13} />
                            {dataset.isFree ? 'Download' : 'Purchase'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <section ref={containerRef} className="py-12 md:py-20 relative z-10 px-4 md:px-6 min-h-screen">
            <div className="container mx-auto max-w-6xl">

                {/* Header */}
                <div className="mb-8 md:mb-10">
                    <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight mb-2">
                        Data Marketplace
                    </h2>
                    <p className="text-blue-200/50 text-sm md:text-base font-light">
                        {datasets.length} datasets · Powered by trustless ShelbyUSD micropayments on Aptos
                    </p>
                </div>

                {/* Search Bar */}
                <div className="relative mb-4 group">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                        <Search size={18} className="text-white/20 group-focus-within:text-blue-400 transition-colors" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search datasets, tags, categories..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[#0B1121]/80 border border-white/8 focus:border-blue-500/40 rounded-2xl py-3.5 pl-12 pr-4 text-white text-sm outline-none transition-all placeholder:text-white/15 backdrop-blur-xl"
                    />
                </div>

                {/* Toolbar: Categories + Sort + View Toggle */}
                <div className="flex flex-col gap-3 mb-6">
                    {/* Row 1: All + Free — centered */}
                    <div className="flex justify-center gap-3">
                        {["All", "Free"].map((cat) => {
                            const isActive = activeCategory === cat;
                            const isFreeCat = cat === "Free";
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setActiveCategory(cat)}
                                    className={`px-6 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all duration-300 flex items-center gap-1.5 ${
                                        isActive && isFreeCat
                                            ? 'bg-green-600 text-white shadow-[0_0_14px_rgba(22,163,74,0.5)] border border-green-400'
                                            : isActive
                                            ? 'bg-blue-600 text-white shadow-[0_0_14px_rgba(37,99,235,0.4)] border border-blue-400'
                                            : isFreeCat
                                            ? 'bg-green-500/10 text-green-400/60 hover:text-green-300 hover:bg-green-500/15 border border-green-500/20'
                                            : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10 border border-white/8'
                                    }`}
                                >
                                    {isFreeCat && <Gift size={12} />}
                                    {cat}
                                </button>
                            );
                        })}
                    </div>

                    {/* Row 2: Other categories — scrollable */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide justify-start">
                        <div className="shrink-0 text-white/20 pr-1">
                            <Filter size={14} />
                        </div>
                        {categories.filter(c => c !== "All" && c !== "Free").map((cat) => {
                            const isActive = activeCategory === cat;
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setActiveCategory(cat)}
                                    className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-all duration-300 shrink-0 ${
                                        isActive
                                            ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.4)] border border-blue-400'
                                            : 'bg-white/5 text-white/35 hover:text-white hover:bg-white/10 border border-white/5'
                                    }`}
                                >
                                    {cat}
                                </button>
                            );
                        })}
                    </div>

                    {/* Sort + Count + View Toggle */}
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-white/30">
                            <span className="text-white/60 font-semibold">{filteredDatasets.length}</span> datasets found
                        </p>
                        <div className="flex items-center gap-2">
                            {/* Sort Dropdown */}
                            <div className="relative">
                                <button
                                    onClick={() => setSortOpen(o => !o)}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/8 text-white/50 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-all"
                                >
                                    <ArrowUpDown size={12} />
                                    {sortBy}
                                    <ChevronDown size={12} className={`transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {sortOpen && (
                                    <div className="absolute right-0 top-full mt-2 bg-[#0d1426]/95 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden z-50 shadow-2xl min-w-[200px]">
                                        {SORT_OPTIONS.map(opt => (
                                            <button
                                                key={opt}
                                                onClick={() => { setSortBy(opt); setSortOpen(false); }}
                                                className={`w-full text-left px-4 py-2.5 text-[11px] font-medium transition-all ${
                                                    sortBy === opt ? 'text-blue-400 bg-blue-500/10' : 'text-white/50 hover:text-white hover:bg-white/5'
                                                }`}
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {/* View Toggle */}
                            <div className="flex items-center bg-white/5 border border-white/8 rounded-xl p-1 gap-1">
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-sm' : 'text-white/30 hover:text-white'}`}
                                >
                                    <List size={14} />
                                </button>
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-sm' : 'text-white/30 hover:text-white'}`}
                                >
                                    <LayoutGrid size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Results */}
                {filteredDatasets.length === 0 ? (
                    <div className="py-24 flex flex-col items-center justify-center text-white/30">
                        <Database size={48} className="mb-4 opacity-20" />
                        <p className="text-lg font-medium">No datasets found</p>
                        <p className="text-sm text-white/20 mt-1">Try adjusting your filters or search query</p>
                    </div>
                ) : viewMode === 'list' ? (
                    /* LIST VIEW */
                    <div className="bg-[#090e1c]/80 backdrop-blur-2xl border border-white/8 rounded-2xl overflow-hidden">
                        {/* List Header */}
                        <div className="hidden md:flex items-center px-4 sm:px-6 py-3 border-b border-white/5 bg-white/[0.02]">
                            <div className="w-10 shrink-0 mr-4" />
                            <div className="flex-1 text-[9px] font-bold uppercase tracking-[0.15em] text-white/25">Dataset</div>
                            <div className="hidden sm:flex items-center gap-4 lg:gap-6 text-[9px] font-bold uppercase tracking-[0.15em] text-white/25 mr-3">
                                <span className="w-16 lg:w-20 text-right">Size</span>
                                <span className="hidden md:inline w-16 text-right">Downloads</span>
                                <span className="hidden lg:inline w-10 text-right">Rating</span>
                                <span className="hidden sm:inline w-20 text-right">Network</span>
                            </div>
                            <div className="w-20 lg:w-28 text-right text-[9px] font-bold uppercase tracking-[0.15em] text-white/25 mr-3">Price</div>
                            <div className="w-10 lg:w-16" />
                        </div>
                        {filteredDatasets.map((ds, idx) => (
                            <ListRow key={ds.id} dataset={ds} idx={idx} />
                        ))}
                    </div>
                ) : (
                    /* GRID VIEW */
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredDatasets.map((ds) => (
                            <GridCard key={ds.id} dataset={ds} />
                        ))}
                    </div>
                )}

                {/* Footer note */}
                <div className="mt-8 flex items-center justify-center gap-2 text-[10px] text-white/15">
                    <Shield size={11} className="text-blue-400/40" />
                    All datasets are immutably stored on-chain via Shelby Protocol · Payments settled in ShelbyUSD (SUSD)
                </div>

            </div>
        </section>
    );
}
