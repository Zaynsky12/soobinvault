"use client";

import { useParams, useRouter } from 'next/navigation';
import React, { useEffect, useState, useMemo } from 'react';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useShelbyClient } from "@shelby-protocol/react";
import { parseAssetId, handlePurchaseTransaction, downloadWithRetry } from '@/utils/payment';
import { GlassCard } from '@/components/ui/GlassCard';
import { MagneticButton } from '@/components/ui/MagneticButton';
import { 
    Download, 
    Shield, 
    Coins, 
    Clock, 
    Share2, 
    CheckCircle, 
    AlertCircle, 
    ExternalLink, 
    Lock,
    Unlock,
    ChevronLeft,
    Tag,
    Globe,
    FileText,
    Activity,
    Check
} from 'lucide-react';
import toast from 'react-hot-toast';
import gsap from 'gsap';

export default function BuyPage() {
    const params = useParams();
    const router = useRouter();
    const { id } = params;
    const { connected, account, signAndSubmitTransaction } = useWallet();
    const shelbyClient = useShelbyClient();

    const [loading, setLoading] = useState(true);
    const [purchasing, setPurchasing] = useState(false);
    const [purchased, setPurchased] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sellerAddress, setSellerAddress] = useState<string | null>(null);
    const [lastTxHash, setLastTxHash] = useState<string | null>(null);
    const [isIndexerLag, setIsIndexerLag] = useState(false);

    const blobName = decodeURIComponent(id as string);
    const metadata = useMemo(() => parseAssetId(blobName), [blobName]);

    useEffect(() => {
        const init = async () => {
            if (!metadata) {
                setError("Invalid asset link.");
                setLoading(false);
                return;
            }

            try {
                // Determine seller immediately from link if possible (Instant Mode)
                if (metadata.seller) {
                    console.log("[Buy] Instant seller detected in link:", metadata.seller);
                    setSellerAddress(metadata.seller);
                }

                // Fetch asset stats to find the owner or confirm metadata
                console.log("[Buy] Attempting indexer discovery for:", blobName);
                
                // Allow a small window for indexer to catch up, but don't block
                const results = await shelbyClient.coordination.getBlobs({
                    where: { blob_name: { _eq: blobName } },
                    pagination: { limit: 1 }
                });

                if (results && results.length > 0) {
                    const ownerRaw = results[0].owner;
                    const owner = typeof ownerRaw === 'string' ? ownerRaw : (ownerRaw as any)?.toString();
                    if (owner) setSellerAddress(owner);
                    setIsIndexerLag(false);
                } else if (metadata.seller) {
                    console.warn("[Buy] Indexer lag detected. Proceeding with link metadata.");
                    setIsIndexerLag(true);
                }
                
                // Entrance animation
                gsap.fromTo('.buy-card', 
                    { y: 50, opacity: 0 },
                    { y: 0, opacity: 1, duration: 1, ease: 'power3.out', delay: 0.2 }
                );
            } catch (err) {
                console.error("Discovery failed, but link might still work:", err);
            } finally {
                setLoading(false);
            }
        };

        if (id) init();
    }, [id, metadata, blobName]);

    const handleBuy = async () => {
        if (!connected || !account) {
            toast.error("Please connect your wallet to purchase.");
            return;
        }

        if (!metadata) return;

        setPurchasing(true);
        try {
            // Final verification of seller address
            let finalSeller = sellerAddress;
            
            if (!finalSeller) {
                const results = await shelbyClient.coordination.getBlobs({
                    where: { blob_name: { _eq: blobName } },
                    pagination: { limit: 1 }
                });
                
                if (results && results.length > 0) {
                    const ownerRaw = results[0].owner;
                    finalSeller = typeof ownerRaw === 'string' ? ownerRaw : (ownerRaw as any)?.toString();
                }
            }

            if (!finalSeller) throw new Error("Could not determine seller address. Please wait 60s if this is a brand new upload.");
            setSellerAddress(finalSeller);

            const response = await handlePurchaseTransaction(
                signAndSubmitTransaction,
                finalSeller,
                blobName,
                metadata.price
            );

            if (response && response.hash) {
                setLastTxHash(response.hash);
            }

            setPurchased(true);
            toast.success("Purchase successful! Initializing download...");
            handleDownload(finalSeller);
        } catch (err: any) {
            console.error("Purchase failed:", err);
            toast.error(err.message || "Purchase failed. Is the asset ready?");
        } finally {
            setPurchasing(false);
        }
    };

    const handleDownload = async (owner: string) => {
        if (!metadata) return;
        setDownloading(true);
        try {
            const buffer = await downloadWithRetry(shelbyClient, owner, blobName);
            
            // Create download link
            const blob = new Blob([buffer as any]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = metadata.title;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            toast.success("Download complete!");
        } catch (err: any) {
            console.error("Download failed:", err);
            toast.error("Decentralized retrieval failed. The asset might still be migrating.");
        } finally {
            setDownloading(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-[#050505] overflow-hidden">
            <div className="relative">
                <div className="w-24 h-24 border-2 border-yellow-500/20 rounded-full animate-ping" />
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 border-4 border-yellow-500/10 border-t-yellow-500 rounded-full animate-spin" />
                </div>
            </div>
        </div>
    );

    if (error || !metadata) return (
         <div className="min-h-screen flex items-center justify-center bg-[#050505] px-6">
            <GlassCard className="max-w-md p-10 text-center border-red-500/30">
                <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
                <p className="text-white/60 mb-8">{error || "Asset not found or link expired."}</p>
                <button onClick={() => router.push('/')} className="px-8 py-3 rounded-xl bg-white/5 text-white text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all">Back to Home</button>
            </GlassCard>
        </div>
    );

    return (
        <main className="min-h-screen bg-[#030303] pt-20 sm:pt-32 pb-20 px-4 sm:px-6 relative overflow-hidden font-sans">
            {/* High-End Aesthetic Background Elements */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[50%] bg-yellow-500/5 rounded-full blur-[100px]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(20,20,30,0)_0%,rgba(5,5,10,1)_100%)]" />
            </div>

            <div className="container mx-auto max-w-6xl relative z-10">
                {/* Back Link */}
                <button 
                    onClick={() => router.push('/vault')}
                    className="inline-flex items-center gap-2 text-white/30 hover:text-white transition-all mb-6 sm:mb-10 group bg-white/5 px-4 py-2 rounded-full border border-white/5"
                >
                    <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Exit to Vault</span>
                </button>

                <div className="buy-card">
                    <GlassCard className="p-0 border-white/10 bg-white/[0.01] relative overflow-hidden backdrop-blur-3xl rounded-[2rem] sm:rounded-[3rem]">
                        {/* Interactive Background Glow */}
                        <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-yellow-500/[0.03] rounded-full blur-[100px] pointer-events-none" />
                        
                        <div className="flex flex-col">
                            {/* Header Section */}
                            <div className="p-6 sm:p-12 lg:p-16 border-b border-white/5">
                                <div className="flex flex-col lg:flex-row gap-8 lg:items-start justify-between">
                                    <div className="flex-1 space-y-4 sm:space-y-6">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <div className="px-3 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[9px] font-black uppercase tracking-[0.2em]">
                                                {metadata.category}
                                            </div>
                                            {isIndexerLag && (
                                                <div className="px-3 py-1 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                                                    <Clock size={10} /> Instant Sync Active
                                                </div>
                                            )}
                                            <div className="flex items-center gap-1.5 text-white/20 text-[9px] font-bold uppercase tracking-[0.2em]">
                                                <Globe size={11} /> Global Checkout
                                            </div>
                                        </div>

                                        <h1 className="text-4xl sm:text-6xl lg:text-8xl font-bold text-white tracking-tight leading-[0.9] break-words">
                                            {metadata.title}
                                        </h1>

                                        <div className="flex items-start gap-4 text-white/40">
                                            <div className="mt-1.5 w-10 sm:w-16 h-[1px] bg-indigo-500/50 shrink-0" />
                                            <p className="text-sm sm:text-base lg:text-xl font-medium leading-relaxed max-w-2xl italic">
                                                {metadata.description || "The owner has designated this asset as priority-access. Encrypted fragments are ready for retrieval."}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Price Card - Redesigned for Mobile */}
                                    <div className="lg:shrink-0">
                                        <div className="relative group/price">
                                            <div className="absolute inset-0 bg-indigo-600/20 blur-2xl group-hover/price:bg-indigo-600/40 transition-all duration-700 rounded-full" />
                                            <div className="relative p-8 sm:p-10 lg:p-12 rounded-[2rem] bg-gradient-to-br from-indigo-600 to-indigo-800 text-white min-w-[240px] shadow-2xl border border-white/10">
                                                <div className="flex items-center justify-between lg:block">
                                                    <div>
                                                        <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 sm:mb-2 text-indigo-200/60">Asset Protocol Price</p>
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight">{metadata.price}</span>
                                                            <span className="text-xs font-black uppercase tracking-[0.2em] text-indigo-200">SUSD</span>
                                                        </div>
                                                    </div>
                                                    <div className="lg:mt-6 pt-4 lg:pt-6 border-t border-indigo-400/20 flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                                                            <Lock size={14} className="text-indigo-200" />
                                                        </div>
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-indigo-100/40">P2P Escrow<br/>Verified</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Info Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border-b border-white/5">
                                {[
                                    { icon: Lock, label: "End-to-End Encryption", desc: "Data is split into encrypted shards across the network.", color: "indigo" },
                                    { icon: Activity, label: "High-Availability Nodes", desc: "Distributed retrieval ensures zero downtime for your assets.", color: "yellow" },
                                    { icon: Shield, label: "Aptos Framework", desc: "Secured by the Move language and decentralized coordination.", color: "indigo" }
                                ].map((item, idx) => (
                                    <div key={idx} className={`p-8 sm:p-10 flex flex-col gap-4 hover:bg-white/[0.02] transition-colors ${idx !== 2 ? 'md:border-r border-b md:border-b-0 border-white/5' : ''}`}>
                                        <div className={`w-10 h-10 rounded-xl bg-${item.color}-500/10 flex items-center justify-center text-${item.color}-500`}>
                                            <item.icon size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-white font-bold text-xs uppercase tracking-widest mb-1">{item.label}</h4>
                                            <p className="text-white/30 text-xs leading-relaxed">{item.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Actions Footer */}
                            <div className="p-6 sm:p-12 lg:p-16 flex flex-col gap-8">
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:gap-6">
                                    {!purchased ? (
                                        <button
                                            onClick={handleBuy}
                                            disabled={purchasing}
                                            className="grow sm:grow-0 px-12 py-5 sm:py-6 rounded-2xl bg-white text-black font-black uppercase tracking-[0.3em] text-xs sm:text-sm hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-4 shadow-[0_20px_40px_rgba(255,255,255,0.05)]"
                                        >
                                            {purchasing ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                                                    Authorizing...
                                                </>
                                            ) : (
                                                <>
                                                    Unlock Dataset <ChevronLeft size={18} className="rotate-180" />
                                                </>
                                            )}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleDownload(sellerAddress || "unknown")}
                                            disabled={downloading}
                                            className="grow sm:grow-0 px-12 py-5 sm:py-6 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black uppercase tracking-[0.3em] text-xs sm:text-sm shadow-[0_20px_40px_rgba(16,185,129,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-4"
                                        >
                                            {downloading ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                                    Retrieving...
                                                </>
                                            ) : (
                                                <>
                                                    Download Securely <Download size={18} />
                                                </>
                                            )}
                                        </button>
                                    )}
                                    
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(window.location.href);
                                            toast.success("Link copied!");
                                        }}
                                        className="px-8 py-5 sm:py-6 rounded-2xl bg-white/5 border border-white/10 text-white/50 font-black uppercase tracking-[0.2em] text-[10px] hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-3"
                                    >
                                        <Share2 size={16} /> Share Link
                                    </button>
                                </div>

                                {/* Security Badges */}
                                <div className="flex flex-wrap items-center justify-between gap-6 pt-8 border-t border-white/5">
                                    <div className="flex items-center gap-6">
                                        <div className="flex items-center gap-2">
                                            <Shield size={14} className="text-indigo-400" />
                                            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">Verified Creator</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Activity size={14} className="text-yellow-500" />
                                            <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">Live Protocol Feed</span>
                                        </div>
                                    </div>
                                    
                                    {lastTxHash && (
                                        <a
                                            href={`https://explorer.aptoslabs.com/txn/${lastTxHash}?network=testnet`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-all"
                                        >
                                            Transaction Hash <ExternalLink size={11} />
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    </GlassCard>
                </div>

                {/* Footer Subtle Text */}
                <div className="mt-12 sm:mt-16 text-center">
                    <p className="text-[9px] text-white/10 font-black uppercase tracking-[0.8em] mb-4">Secured by Shelby Protocol & SoobinVault</p>
                    <div className="flex justify-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/5" />
                        <div className="w-1.5 h-1.5 rounded-full bg-white/5" />
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    </div>
                </div>
            </div>
        </main>
    );
}
