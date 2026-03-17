"use client";

import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Lock, FileText, Image as ImageIcon, Database, Link as LinkIcon, Download, PackageOpen, Loader2, CheckCircle2, Clock, Search, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { GlassCard } from './ui/GlassCard';
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { useShelbyClient, useDeleteBlobs } from "@shelby-protocol/react";
import { LinkPreviewModal } from './LinkPreviewModal';

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

    // Modal State
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState<{
        name: string;
        url: string;
        sizeStr: string;
        isImage: boolean;
        hash: string;
        txHash: string;
        blobAccount: string;
        blobName: string;
    } | null>(null);
    
    // Deletion Hook
    const deleteBlobs = useDeleteBlobs({
        client: shelbyClient,
    });


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
        } catch (error) {
            console.error("Failed to fetch blobs", error);
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
                    <div className="mb-8 md:mb-0 flex flex-col items-center md:items-start">
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
                        <div className="col-span-2 text-right">Manage</div>
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

                                return combined
                                    .filter(asset => {
                                        const assetHash = asset.blob_merkle_root || asset.merkle_root || asset.merkleRoot || asset.hash || asset.blob_hash || asset.blob_id || asset.blobId || (asset.metadata && (asset.metadata.blob_merkle_root || asset.metadata.merkle_root || asset.metadata.hash)) || '';
                                        const name = asset.blobNameSuffix || (typeof asset.name === 'string' ? asset.name.replace(/^@[^/]+\//, '') : asset.name);
                                        return name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                            (assetHash && assetHash.toLowerCase().includes(searchQuery.toLowerCase()));
                                    })
                                    .map((asset, index) => {
                                        const displayName: string =
                                            asset.blobNameSuffix ||
                                            (typeof asset.name === 'string' ? asset.name.replace(/^@[^/]+\//, '') : asset.name);
                                        const sizeMB = (asset.size / (1024 * 1024)).toFixed(2);
                                        const isImg = !!displayName.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);

                                        // Robust extraction of identifier and name from indexer "@identifier/path" format
                                        const nameStr = typeof asset.name === 'string' ? asset.name : '';
                                        const nameMatch = nameStr.match(/^@([^/]+)\/(.+)$/);
                                        if (index === 0) console.log('[Debug] Asset structure:', JSON.stringify(asset, null, 2));

                                        // Use extracted identifier or fallback to account address
                                        const identifier = nameMatch ? nameMatch[1] : (account?.address?.toString() || '');
                                        // Ensure the identifier has the 0x prefix if it appears to be a raw hex address
                                        let finalIdentifier = identifier;
                                        const isHex = /^[0-9a-fA-F]+$/.test(finalIdentifier);
                                        if (finalIdentifier && !finalIdentifier.startsWith('0x') && isHex && finalIdentifier.length >= 60) {
                                            finalIdentifier = `0x${finalIdentifier}`;
                                        }

                                        // Use extracted nameOnly or fallback to blobNameSuffix or raw name
                                        const nameOnly = nameMatch ? nameMatch[2] : (asset.blobNameSuffix || nameStr);

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
                                            // blobName must match exactly what was passed during upload: droppedFile.name (just filename)
                                            // displayName is already the clean filename (blobNameSuffix or stripped name)
                                            const resolvedAccount = account?.address?.toString() || '';
                                            console.log('[Debug] Opening preview:', { resolvedAccount, blobName: displayName, nameOnly, nameStr, blobNameSuffix: asset.blobNameSuffix });
                                            setSelectedAsset({
                                                name: displayName,
                                                url: downloadUrl || '',
                                                sizeStr: sizeMB,
                                                isImage: isImg,
                                                hash: assetHash,
                                                txHash: txHash,
                                                blobAccount: resolvedAccount,
                                                blobName: displayName,
                                            });
                                            setIsPreviewModalOpen(true);
                                        };

                                        return (
                                            <AssetRow
                                                key={assetHash || asset.blob_merkle_root || index}
                                                asset={asset}
                                                assetHash={assetHash}
                                                txHash={txHash}
                                                index={index}
                                                displayName={displayName}
                                                sizeMB={sizeMB}
                                                isImg={isImg}
                                                downloadUrl={downloadUrl}
                                                handleOpenPreview={handleOpenPreview}
                                                deleteBlobs={deleteBlobs}
                                                fetchBlobs={fetchBlobs}
                                                signAndSubmitTransaction={signAndSubmitTransaction}
                                                account={account}
                                                shelbyClient={shelbyClient}
                                            />
                                        );
                                    })
                            })()
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
                assetHash={selectedAsset?.hash || ''}
                txHash={selectedAsset?.txHash || ''}
                assetUrl={selectedAsset?.url || null}
                assetSizeStr={selectedAsset?.sizeStr || '0'}
                isImage={selectedAsset?.isImage || false}
                apiKey={shelbyClient.rpc.apiKey}
                onFetch={selectedAsset?.blobAccount && selectedAsset?.blobName ? async () => {
                    try {
                        const shelbyBlob = await shelbyClient.download({
                            account: selectedAsset.blobAccount,
                            blobName: selectedAsset.blobName,
                        });
                        return shelbyBlob.readable;
                    } catch (err: any) {
                        if (err?.message?.includes('not yet been marked')) return null;
                        throw err;
                    }
                } : undefined}
                onDownload={async () => {
                    if (selectedAsset && selectedAsset.blobAccount && selectedAsset.blobName) {
                        try {
                            toast.loading('Preparing download...', { id: 'dl' });
                            const shelbyBlob = await shelbyClient.download({
                                account: selectedAsset.blobAccount,
                                blobName: selectedAsset.blobName,
                            });
                            const reader = shelbyBlob.readable.getReader();
                            const chunks: Uint8Array[] = [];
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                if (value) chunks.push(value);
                            }
                            const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
                            const merged = new Uint8Array(totalLength);
                            let offset = 0;
                            for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
                            const blob = new Blob([merged]);
                            const downloadLink = document.createElement('a');
                            const url = URL.createObjectURL(blob);
                            downloadLink.href = url;
                            downloadLink.download = selectedAsset.name;
                            downloadLink.click();
                            setTimeout(() => URL.revokeObjectURL(url), 100);
                            toast.success('Download started!', { id: 'dl' });
                        } catch (err) {
                            console.error('[Dashboard] Download via SDK failed:', err);
                            toast.error(`Download failed: ${err instanceof Error ? err.message : String(err)}`, { id: 'dl' });
                        }
                    } else {
                        toast.error('Cannot download: asset details missing.');
                    }
                }}
            />
        </section>
    );
}

function AssetRow({ asset, index, displayName, sizeMB, isImg, downloadUrl, handleOpenPreview, assetHash, txHash, deleteBlobs, fetchBlobs, signAndSubmitTransaction, account, shelbyClient }: any): React.ReactNode {
    const [status, setStatus] = useState<'checking' | 'syncing' | 'live'>('checking');

    useEffect(() => {
        if (!downloadUrl) return;

        const checkStatus = async () => {
            if (!downloadUrl) {
                setStatus('syncing');
                return;
            }

            const apiKey = shelbyClient.rpc.apiKey || process.env.NEXT_PUBLIC_SHELBY_API_KEY || "aptoslabs_8TvZJ1y8YXj_QKYMB9C3GLUmcEMbvtXVscowf3xfwjTTW";
            try {
                const response = await fetch(downloadUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKey.trim()}`,
                        'Range': 'bytes=0-0'
                    }
                });

                if (response.ok) {
                    setStatus('live');
                } else {
                    console.log(`[Shelby] Status check for ${displayName}: ${response.status} ${response.statusText}`);
                    if (response.status === 429) {
                        setTimeout(checkStatus, 15000);
                    } else if (response.status === 404 || response.status === 500) {
                        setStatus('syncing');
                        setTimeout(checkStatus, 3000 + Math.random() * 2000);
                    } else {
                        setStatus('checking');
                        setTimeout(checkStatus, 5000);
                    }
                }
            } catch (e) {
                console.error(`[Shelby] Status check failed for ${displayName}`, e);
                setStatus('checking');
                setTimeout(checkStatus, 15000);
            }
        };

        // If not live yet, check status
        if (status !== 'live') {
            checkStatus();
        }
    }, [downloadUrl, displayName]); // Remove status from deps to avoid loop, use internal logic

    const handleDownload = async (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();

        // Pre-download validation
        if (status !== 'live') {
            toast("File sedang dalam proses indexing di Shelby network. Coba lagi dalam 30 detik.", {
                icon: '⚠️'
            });
            return;
        }

        if (!downloadUrl) {
            return;
        }
        const apiKey = shelbyClient.rpc.apiKey || process.env.NEXT_PUBLIC_SHELBY_API_KEY || "aptoslabs_8TvZJ1y8YXj_QKYMB9C3GLUmcEMbvtXVscowf3xfwjTTW";
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

                // Detailed debug as requested
                console.log('[Debug] Download Response:', response.status, errorDetail, {
                    name: displayName,
                    url: downloadUrl,
                    status: status
                });

                throw new Error(errorDetail || `Server returned ${response.status}`);
            }

            const fileData = await response.blob();
            console.log(`[Debug] Downloaded blob for ${displayName}:`, {
                type: fileData.type,
                size: fileData.size,
                name: displayName
            });

            const downloadLink = document.createElement("a");
            const url = URL.createObjectURL(fileData);
            downloadLink.href = url;
            downloadLink.download = displayName;
            downloadLink.click();
            setTimeout(() => URL.revokeObjectURL(url), 100);
            toast.success("Download started!");
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);

            // Tame specific indexing error with a user-friendly info toast
            if (msg.toLowerCase().includes('index') || msg.toLowerCase().includes('process')) {
                toast("File sedang dalam proses finalisasi di jaringan. Coba lagi dalam 30 detik.", {
                    icon: '⏳',
                    duration: 5000
                });
            } else {
                console.error("Download failed", err);
                toast.error(msg);
            }
        }
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        
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
                    signAndSubmitTransaction: (tx: any) => signAndSubmitTransaction(tx),
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
            toast.error(err instanceof Error ? err.message : "Failed to delete asset", { id: 'delete-blob' });
        }
    };


    return (
        <div
            className={`asset-row flex flex-col md:grid md:grid-cols-12 gap-4 p-5 md:p-6 items-center transition-all duration-500 relative overflow-hidden border-b border-white/5 last:border-0 hover:bg-white/[0.03] cursor-pointer group ${status !== 'live' ? 'opacity-80' : ''}`}
            onClick={handleOpenPreview}
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
                    <div className="flex items-center gap-2">
                        <span className="text-white font-bold truncate text-base group-hover:text-color-primary transition-colors duration-300">{displayName}</span>
                        {asset.isOptimistic && (
                            <span className="px-2 py-0.5 rounded-md bg-color-primary/10 border border-color-primary/20 text-[8px] font-bold text-color-primary uppercase tracking-tighter animate-pulse">
                                Processing
                            </span>
                        )}
                    </div>
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
                            toast("File sedang dalam proses finalisasi di jaringan. Coba lagi dalam 30 detik.", {
                                icon: '⏳'
                            });
                        }
                    }}
                >
                    <Download size={18} />
                    <span className="md:hidden font-bold text-[11px] uppercase tracking-[0.2em]">
                        {status === 'live' ? 'Download File' : 'Processing...'}
                    </span>
                </button>
            </div>

            {/* Actions Button (Delete) */}
            <div className="w-full md:col-span-2 relative z-10 flex md:justify-end items-center mb-2 md:mb-0">
                <button
                    className="w-full md:w-11 md:h-11 flex items-center justify-center gap-3 md:gap-0 px-5 py-3 md:p-0 rounded-xl bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white transition-all duration-300 shadow-lg group/delete"
                    onClick={handleDelete}
                    title="Delete Asset"
                    disabled={deleteBlobs.isPending}
                >
                    {deleteBlobs.isPending ? (
                        <Loader2 size={18} className="animate-spin" />
                    ) : (
                        <Trash2 size={18} />
                    )}
                    <span className="md:hidden font-bold text-[11px] uppercase tracking-[0.2em]">Delete Asset</span>
                </button>
            </div>
        </div>
    );
}

