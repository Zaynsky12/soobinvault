"use client";

import Image from 'next/image';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useState, useMemo } from 'react';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useShelbyClient } from "@shelby-protocol/react";
import { parseAssetId, handlePurchaseTransaction, downloadWithRetry, isSvMarketFile } from '@/utils/payment';
import { decryptAceFile } from '@/utils/crypto';
import { MARKETPLACE_REGISTRY_ADDRESS } from '@/lib/constants';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
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
    Check,
    Wallet,
    LogOut,
    User,
    Twitter,
    ArrowUpRight
} from 'lucide-react';
import { WalletSelector } from '@/components/WalletSelector';
import toast from 'react-hot-toast';
import gsap from 'gsap';


const aptosConfig = new AptosConfig({ network: Network.TESTNET });
const aptosClient = new Aptos(aptosConfig);

export default function BuyPage() {
    const params = useParams();
    const router = useRouter();
    const { id } = params;
    const searchParams = useSearchParams();
    const sellerParam = searchParams.get('s');
    const { connected, account, signAndSubmitTransaction, disconnect, signMessage } = useWallet();
    const shelbyClient = useShelbyClient();

    const [loading, setLoading] = useState(true);
    const [purchasing, setPurchasing] = useState(false);
    const [purchased, setPurchased] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sellerAddress, setSellerAddress] = useState<string | null>(null);
    const [lastTxHash, setLastTxHash] = useState<string | null>(null);
    const [isIndexerLag, setIsIndexerLag] = useState(false);
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const [xHandle, setXHandle] = useState<string | null>(null);
    const [isVerified, setIsVerified] = useState(false);

    const blobName = decodeURIComponent(id as string);
    const metadata = useMemo(() => parseAssetId(blobName), [blobName]);

    // For new .svmarket format: on-chain metadata overrides the parse-time placeholder
    const [overrideMeta, setOverrideMeta] = useState<{
        price: string;
        category: string;
        description: string;
    } | null>(null);

    // Effective metadata: blend parseAssetId result with on-chain data
    const effectiveMetadata = useMemo(() => {
        if (!metadata) return null;
        if (!overrideMeta) return metadata;
        return { ...metadata, ...overrideMeta };
    }, [metadata, overrideMeta]);

    // True once we know the price (avoids false "free" flash for new-format assets)
    const metadataReady = !metadata?.isNewFormat || overrideMeta !== null;

    useEffect(() => {
        const checkAccess = async () => {
            if (!effectiveMetadata || !metadataReady) return;

            // If price is 0, it's free to all
            if (parseFloat(effectiveMetadata.price) === 0) {
                setPurchased(true);
                return;
            }

            // If user is the seller/owner, they don't need to buy
            if (connected && account && sellerAddress) {
                const addrStr = account.address.toString();
                if (addrStr === sellerAddress) {
                    setPurchased(true);
                    return;
                }
            }
        };

        checkAccess();
    }, [connected, account, effectiveMetadata, metadataReady, sellerAddress]);

    // For new .svmarket format: re-fetch real metadata from contract when seller is identified
    useEffect(() => {
        if (!metadata?.isNewFormat || !sellerAddress || overrideMeta?.price !== '…') return;
        const fetchOnChainMeta = async () => {
            try {
                const storefront = await aptosClient.view({
                    payload: {
                        function: `${MARKETPLACE_REGISTRY_ADDRESS}::marketplace::get_user_storefront`,
                        functionArguments: [sellerAddress]
                    }
                });
                if (storefront && Array.isArray(storefront[0])) {
                    const dataset = (storefront[0] as any[]).find(
                        d => d.blob_name === blobName || d.blobName === blobName
                    );
                    if (dataset) {
                        const priceDecimal = (parseInt(dataset.price ?? '0') / 100_000_000).toFixed(2);
                        setOverrideMeta({
                            price: priceDecimal,
                            category: dataset.category || 'Dataset',
                            description: dataset.description || '',
                        });
                    }
                }
            } catch (e) {
                console.warn('[Buy] Retry metadata fetch failed:', e);
            }
        };
        fetchOnChainMeta();
    }, [sellerAddress, metadata?.isNewFormat, overrideMeta?.price, blobName]);

    useEffect(() => {
        const init = async () => {
            if (!metadata) {
                setError('Invalid asset link.');
                setLoading(false);
                return;
            }

            try {
                // Determine seller immediately from link if possible (Instant Mode)
                if (metadata.seller) {
                    console.log("[Buy] Instant seller detected in link:", metadata.seller);
                    setSellerAddress(metadata.seller);
                } else if (sellerParam) {
                    console.log("[Buy] Instant seller detected in query param:", sellerParam);
                    setSellerAddress(sellerParam);
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

                    // VERIFY LISTING STATUS IN SMART CONTRACT + fetch on-chain metadata for new format
                    if (owner) {
                        try {
                            const storefront = await aptosClient.view({
                                payload: {
                                    function: `${MARKETPLACE_REGISTRY_ADDRESS}::marketplace::get_user_storefront`,
                                    functionArguments: [owner]
                                }
                            });

                            if (storefront && Array.isArray(storefront[0])) {
                                const dataset = (storefront[0] as any[]).find(
                                    d => d.blob_name === blobName || d.blobName === blobName
                                );
                                if (!dataset) {
                                    setError('This payment link is inactive or has been deleted.');
                                    setLoading(false);
                                    return;
                                }
                                // For new .svmarket format: extract real metadata from contract
                                if (metadata.isNewFormat && dataset) {
                                    const priceDecimal = (parseInt(dataset.price ?? '0') / 100_000_000).toFixed(2);
                                    setOverrideMeta({
                                        price: priceDecimal,
                                        category: dataset.category || 'Dataset',
                                        description: dataset.description || '',
                                    });
                                }
                            }
                        } catch (contractErr) {
                            console.warn('[Buy] Contract verification failed (ignoring for resilience):', contractErr);
                        }
                    }
                } else if (metadata.seller) {
                    console.warn("[Buy] Indexer lag detected. Proceeding with link metadata.");
                    setIsIndexerLag(true);
                }

                // FETCH SELLER PROFILE FOR TRUST CARD
                if (metadata.seller || sellerAddress || sellerParam) {
                    const target = sellerAddress || metadata.seller || sellerParam;
                    if (target) {
                        try {
                            const profile = await aptosClient.view({
                                payload: {
                                    function: `${MARKETPLACE_REGISTRY_ADDRESS}::marketplace::get_user_profile`,
                                    functionArguments: [target]
                                }
                            });
                            if (profile && profile[0]) {
                                setXHandle(profile[0] as string);
                                setIsVerified(profile[1] as boolean);
                            }
                        } catch (e) {
                            console.warn("[Buy] Profile fetch failed:", e);
                        }
                    }
                }

                // VERIFY LISTING STATUS VIA LINK METADATA SELLER OR PARAM
                const fallbackSeller = metadata.seller || sellerParam;
                if (fallbackSeller) {
                    try {
                        const storefront = await aptosClient.view({
                            payload: {
                                function: `${MARKETPLACE_REGISTRY_ADDRESS}::marketplace::get_user_storefront`,
                                functionArguments: [fallbackSeller]
                            }
                        });
                        
                        if (storefront && Array.isArray(storefront[0])) {
                            const isListed = (storefront[0] as any[]).some(d => d.blob_name === blobName || d.blobName === blobName);
                            if (!isListed) {
                                setError("This payment link is inactive or has been deleted.");
                                setLoading(false);
                                return;
                            }
                            
                            // Load missing metadata since we have the contract storefront!
                            if (metadata.isNewFormat) {
                                const dataset = (storefront[0] as any[]).find(d => d.blob_name === blobName || d.blobName === blobName);
                                if (dataset) {
                                    const priceDecimal = (parseInt(dataset.price ?? '0') / 100_000_000).toFixed(2);
                                    setOverrideMeta({
                                        price: priceDecimal,
                                        category: dataset.category || 'Dataset',
                                        description: dataset.description || '',
                                    });
                                }
                            }
                        }
                    } catch (contractErr) {
                        console.warn("[Buy] Contract verification failed via link seller:", contractErr);
                    }
                } else {
                    // Fallback: If no seller found and indexer nothing, link might be truly orphan
                    console.warn("[Buy] No seller identified. Link might be invalid.");
                }
                
                // Entrance animation
                gsap.fromTo('.buy-card', 
                    { y: 50, opacity: 0 },
                    { y: 0, opacity: 1, duration: 1, ease: 'power3.out', delay: 0.2 }
                );
            } catch (err) {
                console.error("Discovery failed, but link might still work:", err);
            } finally {
                // For new .svmarket format: guarantee metadataReady becomes true so the page
                // can render. If we got real on-chain metadata it won't be overwritten.
                if (metadata?.isNewFormat) {
                    setOverrideMeta(prev => prev ?? {
                        price: '…',          // placeholder until wallet connects & storefront loads
                        category: 'Dataset',
                        description: '',
                    });
                }
                setLoading(false);
            }
        };

        if (id) init();
    }, [id, metadata, blobName, sellerParam]);

    const handleBuy = async () => {
        if (!connected || !account) {
            toast.error("Please connect your wallet to purchase.");
            return;
        }

        if (!effectiveMetadata) return;

        setPurchasing(true);
        try {
            // Final verification of seller address
            let finalSeller = sellerAddress || sellerParam;
            
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
                effectiveMetadata?.price ?? '0'
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

    const handleWalletAction = () => {
        if (connected) {
            disconnect();
            toast.success("Wallet disconnected.");
        } else {
            setIsSelectorOpen(true);
        }
    };

    const handleDownload = async (owner: string) => {
        if (!effectiveMetadata) return;
        setDownloading(true);
        try {
            const buffer = await downloadWithRetry(shelbyClient, owner, blobName);
            if (!buffer) throw new Error("Asset retrieval failed: connection lost.");
            
            let finalBufferData: Uint8Array = new Uint8Array(buffer);

            // ACE DECRYPTION — handles both old sv_market-- and new .svmarket format
            if (isSvMarketFile(blobName)) {
                toast.loading('Verifying permission & deciphering via ACE...', { id: 'decryption-status' });
                try {
                    finalBufferData = await decryptAceFile({
                        rawBuffer: finalBufferData,
                        blobName: blobName,
                        ownerAddress: sellerAddress || '',
                        account: account,
                        signMessage: signMessage
                    });
                    toast.success('File deciphered successfully!', { id: 'decryption-status' });
                } catch (aceErr: any) {
                    toast.error(aceErr.message || 'Failed to decipher file.', { id: 'decryption-status' });
                    throw aceErr;
                }
            }
            
            // Create download link
            const blob = new Blob([finalBufferData as any]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = effectiveMetadata?.title || blobName;
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

    if (loading || (metadata?.isNewFormat && !metadataReady)) return (
        <div className="min-h-screen flex items-center justify-center bg-[#050505] overflow-hidden">
            <div className="relative">
                <div className="w-24 h-24 border-2 border-yellow-500/20 rounded-full animate-ping" />
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 border-4 border-yellow-500/10 border-t-yellow-500 rounded-full animate-spin" />
                </div>
            </div>
        </div>
    );

    if (error || !effectiveMetadata) return (
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
                    className="inline-flex items-center gap-2 text-red-500/50 hover:text-red-400 transition-all mb-6 sm:mb-10 group bg-red-500/5 px-4 py-2 rounded-full border border-red-500/10"
                >
                    <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Exit to Vault</span>
                </button>
                
                <WalletSelector isOpen={isSelectorOpen} onClose={() => setIsSelectorOpen(false)} />

                <div className="buy-card">
                    <GlassCard className="p-0 border-white/10 bg-white/[0.01] relative overflow-hidden backdrop-blur-3xl rounded-[2rem] sm:rounded-[3rem]">
                        {/* Enhanced Creator Trust Header (Ultra-Premium & Compact Mobile) */}
                        <div className="border-b border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent p-5 sm:p-10 relative overflow-hidden group/header">
                            {/* Dynamic Ambient Glow */}
                            <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/10 blur-[100px] group-hover/header:bg-indigo-500/20 transition-all duration-1000" />
                            
                            <div className="relative z-10 flex flex-col md:flex-row items-center md:items-stretch gap-5 md:gap-10">
                                {/* Creator Avatar: Refined sizing */}
                                <div className="relative shrink-0">
                                    <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full opacity-0 group-hover/header:opacity-100 transition-opacity duration-1000" />
                                    <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-[#1a1a1a] to-[#0a0a0a] border border-white/10 flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.5)] relative z-10">
                                        <User size={30} className="text-white/10 sm:w-12 sm:h-12" />
                                        {isVerified && (
                                            <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 sm:w-7 sm:h-7 bg-blue-500 rounded-full border-2 border-[#0B1121] flex items-center justify-center shadow-lg">
                                                <CheckCircle size={12} className="text-white fill-white/20 sm:w-[14px]" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="flex-1 flex flex-col justify-center min-w-0 w-full text-center md:text-left">
                                    {/* Verification Badges Row */}
                                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-3">
                                        <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest truncate max-w-[150px] sm:max-w-none">
                                                {sellerAddress ? `${sellerAddress.slice(0, 6)}...${sellerAddress.slice(-6)}` : "Authenticating..."}
                                            </span>
                                        </div>
                                        {isVerified && (
                                            <div className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center gap-1.5">
                                                <Shield size={10} className="text-blue-400" />
                                                <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Verified Creator</span>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Creator ID Row */}
                                    <div className="flex flex-col sm:flex-row items-center md:justify-start gap-3 md:gap-4">
                                        {xHandle ? (
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-2xl sm:text-4xl font-black text-white tracking-tighter leading-none italic group-hover/header:text-indigo-200 transition-colors">
                                                    {xHandle}
                                                </h3>
                                                <a 
                                                    href={`https://x.com/${xHandle.replace('@', '')}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/5 border border-white/10 text-white/20 hover:text-white hover:bg-blue-500/20 hover:border-blue-500/40 transition-all flex items-center justify-center group/social shrink-0"
                                                    title="View Profile on X"
                                                >
                                                    <Twitter size={15} className="group-hover/social:scale-110 transition-transform sm:w-[18px]" />
                                                </a>
                                            </div>
                                        ) : (
                                            <h3 className="text-xl sm:text-2xl font-black text-white/80 italic">Anonymous Creator</h3>
                                        )}
                                        
                                    </div>
                                </div>

                                {/* Desktop: Side Action | Mobile: Bottom Action */}
                                <div className="w-full md:w-auto flex items-center mt-2 md:mt-0">
                                    <a 
                                        href={`https://explorer.aptoslabs.com/account/${sellerAddress}?network=testnet`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="w-full md:w-auto px-6 py-4 md:py-6 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 font-black uppercase tracking-[0.3em] text-[9px] sm:text-[10px] hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all flex items-center justify-center gap-3 group/btn shadow-[0_0_20px_rgba(79,70,229,0.1)]"
                                    >
                                        <span>Verify Profile</span>
                                        <ArrowUpRight size={16} className="group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1 transition-transform sm:w-[18px]" />
                                    </a>
                                </div>
                            </div>
                        </div>

                        {/* Interactive Background Glow */}
                        <div className="absolute top-20 right-0 w-1/2 h-1/2 bg-yellow-500/[0.03] rounded-full blur-[100px] pointer-events-none" />
                        
                        <div className="flex flex-col">
                            {/* Header Content Section: Side-by-Side on all screens */}
                            <div className="p-5 sm:p-12 lg:p-16 border-b border-white/5">
                                <div className="flex flex-row items-start justify-between gap-4 sm:gap-8">
                                    <div className="flex-1 space-y-3 sm:space-y-6 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em]">
                                                {effectiveMetadata.category || 'Dataset'}
                                            </div>
                                        </div>

                                        <h1 className="text-xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.1] sm:leading-[0.9] break-words">
                                            {effectiveMetadata.title}
                                        </h1>

                                        <div className="flex items-start gap-3 sm:gap-4 text-white/40">
                                            <div className="mt-1.5 w-6 sm:w-16 h-[1px] bg-indigo-500/50 shrink-0" />
                                            <p className="text-[10px] sm:text-base lg:text-xl font-medium leading-relaxed max-w-2xl italic line-clamp-2 sm:line-clamp-none">
                                                {effectiveMetadata.description || 'The owner has designated this asset as priority-access.'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Responsive Price Card: Compact on mobile, standard on desktop */}
                                    <div className="shrink-0">
                                        <div className="relative group/price">
                                            <div className="absolute inset-0 bg-indigo-600/20 blur-2xl group-hover/price:bg-indigo-600/40 transition-all duration-700 rounded-full" />
                                            <div className="relative p-3 sm:p-10 lg:p-12 rounded-xl sm:rounded-[2rem] bg-gradient-to-br from-indigo-600 to-indigo-800 text-white min-w-[80px] sm:min-w-[240px] shadow-2xl border border-white/10 text-center">
                                                <div>
                                                    <p className="text-[6px] sm:text-[10px] font-black uppercase tracking-[0.3em] mb-1 sm:mb-2 text-indigo-200/60">Asset Price</p>
                                                    <div className="flex items-baseline justify-center gap-1 sm:gap-2">
                                                        <span className="text-xl sm:text-6xl lg:text-7xl font-black tracking-tight">{effectiveMetadata.price}</span>
                                                        <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200">SUSD</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Actions Footer */}
                            <div className="p-6 sm:p-12 lg:p-16 flex flex-col gap-8">
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:gap-6">
                                    {!purchased ? (
                                        connected ? (
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
                                                        Buy Now <ChevronLeft size={18} className="rotate-180" />
                                                    </>
                                                )}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => setIsSelectorOpen(true)}
                                                className="grow sm:grow-0 px-12 py-5 sm:py-6 rounded-2xl bg-indigo-600 text-white font-black uppercase tracking-[0.3em] text-xs sm:text-sm hover:bg-indigo-500 active:scale-[0.98] transition-all flex items-center justify-center gap-4 shadow-[0_20px_40px_rgba(79,70,229,0.2)] animate-pulse"
                                            >
                                                <Wallet size={18} /> Connect Wallet
                                            </button>
                                        )
                                    ) : connected ? (
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
                                                    Download <Download size={18} />
                                                </>
                                            )}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setIsSelectorOpen(true)}
                                            className="grow sm:grow-0 px-12 py-5 sm:py-6 rounded-2xl bg-indigo-600 text-white font-black uppercase tracking-[0.3em] text-xs sm:text-sm hover:bg-indigo-500 active:scale-[0.98] transition-all flex items-center justify-center gap-4 shadow-[0_20px_40px_rgba(79,70,229,0.2)] animate-pulse"
                                        >
                                            <Wallet size={18} /> Connect to Download
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

                                {/* Embedded Security Footer */}
                                <div className="mt-6 text-center">
                                    <p className="text-[8px] text-white/30 font-black uppercase tracking-[0.5em]">Secured by Shelby & SoobinVault</p>
                                </div>
                            </div>
                        </div>
                    </GlassCard>
                </div>
            </div>
        </main>
    );
}
