"use client";
import React, { useState, useEffect } from 'react';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useVaultKey } from "@/context/VaultKeyContext";
import { GlassCard } from "@/components/ui/GlassCard";
import { 
    User, 
    Shield, 
    Twitter, 
    CheckCircle, 
    Fingerprint, 
    Activity, 
    ExternalLink, 
    Copy, 
    RefreshCcw,
    AlertCircle,
    Info,
    ArrowUpRight,
    Lock,
    LogOut,
    Settings,
    Globe
} from 'lucide-react';
import toast from 'react-hot-toast';
import { MARKETPLACE_REGISTRY_ADDRESS } from '@/lib/constants';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import { useShelbyClient } from "@shelby-protocol/react";
import gsap from 'gsap';

const aptosConfig = new AptosConfig({ network: Network.TESTNET });
const aptosClient = new Aptos(aptosConfig);

export default function AccountPage() {
    const { account, connected, signAndSubmitTransaction, disconnect } = useWallet();
    const { keyFingerprint, encryptionKey, ensureKey, lockVault } = useVaultKey();
    const shelbyClient = useShelbyClient();

    const [xHandle, setXHandle] = useState("");
    const [isVerified, setIsVerified] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [stats, setStats] = useState({ totalFiles: 0, totalSales: 0 });

    useEffect(() => {
        const fetchProfile = async () => {
            if (!account || !connected) return;
            
            // Normalize address to standard 0x hex string
            const addrStr = account.address.toString();
            console.log("[Account] Fetching data for:", addrStr);

            try {
                // 1. Fetch Profile from Smart Contract
                try {
                    const profile = await aptosClient.view({
                        payload: {
                            function: `${MARKETPLACE_REGISTRY_ADDRESS}::marketplace::get_user_profile`,
                            functionArguments: [addrStr]
                        }
                    });

                    if (profile && Array.isArray(profile) && profile.length >= 2) {
                        setXHandle(profile[0] as string);
                        setIsVerified(profile[1] as boolean);
                    }
                } catch (profErr) {
                    console.warn("[Account] Profile fetch failed (user may not have profile):", profErr);
                }

                // 2. Fetch Total Blobs from Indexer
                try {
                    // Try fetch with a slight delay if needed, or just standard fetch
                    const blobs = await shelbyClient.coordination.getBlobs({
                        where: { owner: { _eq: addrStr } }
                    });
                    
                    // 3. Fetch Active Listings from Contract
                    const storefront = await aptosClient.view({
                        payload: {
                            function: `${MARKETPLACE_REGISTRY_ADDRESS}::marketplace::get_user_storefront`,
                            functionArguments: [addrStr]
                        }
                    });

                    // Calculate active listings based only on files actually present in the vault
                    // We must normalize the blob name to handle the @owner/ prefix used by the indexer
                    const actualListings = (storefront && Array.isArray(storefront[0])) 
                        ? storefront[0].filter((listing: any) => 
                            blobs?.some((blob: any) => {
                                const nameStr = blob.name || blob.blob_name || "";
                                // Extract name part if it has @owner/ prefix
                                const nameMatch = nameStr.match(/^@([^/]+)\/(.+)$/);
                                const normalizedName = nameMatch ? nameMatch[2] : (blob.blobNameSuffix || nameStr);
                                return normalizedName === listing.blob_name;
                            })
                          ) 
                        : [];

                    setStats({
                        totalFiles: blobs?.length || 0,
                        totalSales: actualListings.length
                    });
                } catch (statErr) {
                    console.error("[Account] Stats fetch failed:", statErr);
                }

            } catch (err) {
                console.error("[Account] Global fetch error:", err);
            }
        };

        fetchProfile();
        
        // Refresh stats periodically
        const interval = setInterval(fetchProfile, 10000);
        return () => clearInterval(interval);
    }, [account, connected, shelbyClient]);

    useEffect(() => {
        gsap.fromTo('.account-section', 
            { y: 30, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8, stagger: 0.2, ease: 'power3.out' }
        );
    }, []);

    const handleSaveProfile = async () => {
        if (!connected || !account) {
            toast.error("Connect wallet to save profile.");
            return;
        }

        const handle = xHandle.startsWith('@') ? xHandle : `@${xHandle}`;
        
        setIsSaving(true);
        try {
            await signAndSubmitTransaction({
                data: {
                    function: `${MARKETPLACE_REGISTRY_ADDRESS}::marketplace::update_profile`,
                    functionArguments: [handle]
                }
            });
            setIsVerified(true);
            toast.success("Profile verified and saved on blockchain!");
        } catch (err) {
            console.error("Profile update failed:", err);
            toast.error("Failed to update profile. User rejected or network error.");
        } finally {
            setIsSaving(false);
        }
    };

    const generateVerificationTweet = () => {
        if (!account) return;
        const text = `I am verifying my identity on @SoobinVault as a Creator.\n\nWallet: ${account.address.toString()}\n\n#SoobinVault #Aptos #VerifiedCreator`;
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
        toast("Post the tweet then click Link Account below.", { icon: '🐦' });
    };

    if (!connected || !encryptionKey) {
        return (
            <div className="min-h-screen bg-color-deep pt-32 pb-20 px-4 sm:px-6 flex items-center justify-center relative overflow-hidden">
                {/* Background Aesthetics */}
                <div className="fixed inset-0 z-0 pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-color-primary/5 rounded-full blur-[120px]" />
                    <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[50%] bg-color-accent/5 rounded-full blur-[100px]" />
                </div>

                <div className="container mx-auto max-w-2xl relative z-10 my-auto w-full">
                    <GlassCard className="transition-all duration-500 overflow-hidden relative bg-[#111827]/80 backdrop-blur-2xl border-white/10 w-full">
                        <div className="w-full min-h-[300px] md:min-h-[400px] flex flex-col items-center justify-center p-5 md:p-10 relative z-10 rounded-3xl">
                            {!connected ? (
                                <div className="flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-500 w-full px-4">
                                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-full glass-panel flex items-center justify-center mb-6 text-color-support/40 bg-black/40 shadow-[0_0_30px_rgba(255,255,255,0.05)] border border-white/10">
                                        <Lock size={40} strokeWidth={1.5} className="md:hidden text-color-support/60" />
                                        <Lock size={48} strokeWidth={1.5} className="hidden md:block text-color-support/60" />
                                    </div>
                                    <h3 className="text-2xl md:text-3xl font-semibold mb-3 text-white tracking-tight">Account Locked</h3>
                                    <p className="text-color-support/70 mb-8 text-sm md:text-lg">Please connect your wallet to view your account details and verify your creator profile.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-500 w-full px-4">
                                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-full glass-panel flex items-center justify-center mb-6 text-color-primary bg-[#1A0D12] shadow-[0_0_30px_rgba(232,58,118,0.2)] border border-color-primary/30">
                                        <Lock size={40} strokeWidth={1.5} className="md:hidden text-color-primary" />
                                        <Lock size={48} strokeWidth={1.5} className="hidden md:block text-color-primary" />
                                    </div>
                                    <h3 className="text-2xl md:text-3xl font-semibold mb-3 text-white tracking-tight">Account Locked</h3>
                                    <p className="text-color-support/70 mb-8 text-sm md:text-lg">Unlock your vault session to view your account details and verify your creator profile.</p>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); ensureKey(true); }}
                                        className="mt-4 px-10 py-4 rounded-full bg-color-primary/20 border border-color-primary/40 text-white transition-all duration-700 font-bold shadow-lg shadow-[0_0_20px_rgba(232,58,118,0.2)] hover:bg-color-primary hover:scale-110 hover:shadow-[0_0_35px_rgba(232,58,118,0.5)] animate-glow-activate w-full sm:w-auto uppercase text-xs tracking-widest"
                                    >
                                        Unlock Vault
                                    </button>
                                </div>
                            )}
                        </div>
                    </GlassCard>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-color-deep pt-32 pb-20 px-4 sm:px-6 relative overflow-hidden">
            {/* Background Aesthetics */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-color-primary/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[50%] bg-color-accent/5 rounded-full blur-[100px]" />
            </div>

            <div className="container mx-auto max-w-5xl relative z-10">
                <div className="flex flex-col md:flex-row gap-8">
                    
                    {/* LEFT COLUMN: SECURITY & FINGERPRINT */}
                    <div className="flex-1 space-y-8">
                        <div className="account-section">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-color-primary mb-4 flex items-center gap-2">
                                <User size={14} /> ACCOUNT OVERVIEW
                            </h2>
                            <GlassCard className="p-8 border-white/5 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-color-primary/5 blur-2xl group-hover:bg-color-primary/10 transition-colors" />
                                
                                <div className="flex items-start justify-between relative z-10">
                                    <div className="flex-1 min-w-0 pr-4">
                                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">Authenticated Wallet</p>
                                        <h3 className="text-lg font-mono text-white break-all">
                                            {account?.address.toString()}
                                        </h3>
                                    </div>
                                    <div className="p-2 rounded-xl bg-white/5 text-white/20 relative z-10">
                                        <Copy size={16} className="cursor-pointer hover:text-white transition-colors" onClick={() => {
                                            navigator.clipboard.writeText(account?.address.toString() || "");
                                            toast.success("Address copied!");
                                        }} />
                                    </div>
                                </div>
                            </GlassCard>
                        </div>

                        <div className="account-section">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-color-primary mb-4 flex items-center gap-2">
                                <Activity size={14} /> VAULT STATISTICS
                            </h2>
                            <div className="grid grid-cols-2 gap-4">
                                <GlassCard className="p-6 border-white/5 text-center transition-all hover:border-white/10">
                                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-2 text-center text-xs">Total Files Stored</p>
                                    <p className="text-3xl font-black text-white">{stats.totalFiles}</p>
                                </GlassCard>
                                <GlassCard className="p-6 border-white/5 text-center transition-all hover:border-white/10">
                                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-2 text-center text-xs">Active Listings</p>
                                    <p className="text-3xl font-black text-white">{stats.totalSales}</p>
                                </GlassCard>
                            </div>
                        </div>


                    </div>

                    {/* RIGHT COLUMN: VERIFICATION */}
                    <div className="w-full md:w-[400px] space-y-8">
                        <div className="account-section">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400 mb-4 flex items-center gap-2">
                                <Twitter size={14} /> CREATOR VERIFICATION
                            </h2>
                            <GlassCard className="p-8 border-blue-500/10">
                                <p className="text-sm text-white/70 mb-6 leading-relaxed">
                                    Build trust with your buyers by linking your X account. This will add a <span className="text-blue-400 font-bold">Verified Creator</span> badge to all your payment links.
                                </p>

                                {isVerified ? (
                                    <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-4 mb-8">
                                        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                                            <CheckCircle size={24} className="text-white" />
                                        </div>
                                        <div className="flex-1 min-w-0 pr-2">
                                            <p className="text-[10px] font-bold text-blue-400/60 uppercase tracking-widest">Verified Profile</p>
                                            <p className="text-lg font-bold text-white truncate">{xHandle}</p>
                                        </div>
                                        <button 
                                            onClick={() => setIsVerified(false)}
                                            className="p-1.5 rounded-lg hover:bg-white/5 text-white/20 hover:text-white transition-all flex-shrink-0"
                                        >
                                            <RefreshCcw size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">X Username</label>
                                            <div className="relative">
                                                <Twitter className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                                                <input 
                                                    type="text" 
                                                    placeholder="@username"
                                                    value={xHandle}
                                                    onChange={(e) => setXHandle(e.target.value)}
                                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-blue-500/50 transition-all font-medium"
                                                />
                                            </div>
                                        </div>

                                        <button 
                                            onClick={generateVerificationTweet}
                                            className="w-full py-4 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 transition-all group"
                                        >
                                            1. Post Verification Tweet <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                        </button>

                                        <button 
                                            onClick={handleSaveProfile}
                                            disabled={isSaving || !xHandle}
                                            className="w-full py-4 rounded-xl bg-blue-600 text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-500 transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isSaving ? "Finalizing on Chain..." : "2. Link Account to Blockchain"}
                                        </button>
                                        
                                        <p className="text-[9px] text-white/20 text-center uppercase tracking-widest flex items-center justify-center gap-1.5">
                                            <AlertCircle size={10} /> This creates a permanent on-chain link.
                                        </p>
                                    </div>
                                )}
                            </GlassCard>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
