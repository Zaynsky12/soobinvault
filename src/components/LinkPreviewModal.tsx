import React, { useEffect, useState } from 'react';
import { X, Copy, CheckCircle, Image as ImageIcon, FileText, Download, Loader2, RefreshCw, Link as LinkIcon } from 'lucide-react';
import gsap from 'gsap';
import { GlassCard } from './ui/GlassCard';

interface LinkPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    assetUrl: string | null;
    assetName: string;
    assetHash: string;
    txHash: string;
    assetSizeStr: string;
    isImage: boolean;
    onDownload: () => void;
}

export function LinkPreviewModal({
    isOpen,
    onClose,
    assetUrl,
    assetName,
    assetHash,
    txHash,
    assetSizeStr,
    isImage,
    onDownload
}: LinkPreviewModalProps) {
    const [copied, setCopied] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const modalRef = React.useRef<HTMLDivElement>(null);
    const overlayRef = React.useRef<HTMLDivElement>(null);

    const isPdf = assetName.toLowerCase().endsWith('.pdf');

    const fetchAsset = async () => {
        if (!assetUrl) return;

        setIsFetching(true);
        setFetchError(null);
        setIsProcessing(false);

        if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
            setBlobUrl(null);
        }

        try {
            const apiKey = process.env.NEXT_PUBLIC_SHELBY_API_KEY || "aptoslabs_hgdBXnSK14t_6GHbXm2irnCgggVW6KNMWogb1qcygNFwS";
            const response = await fetch(assetUrl, {
                headers: {
                    'Authorization': `Bearer ${apiKey.trim()}`
                }
            });
            const contentType = response.headers.get('content-type');

            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                if (data.error && data.error.toLowerCase().includes('not yet been marked successfully written')) {
                    setIsProcessing(true);
                } else {
                    setFetchError(data.message || data.error || 'Failed to fetch asset');
                }
            } else if (response.ok) {
                const blob = await response.blob();

                // Force correct MIME type for previewing
                let forcedMimeType = blob.type;
                if (isPdf) {
                    forcedMimeType = 'application/pdf';
                } else if (isImage) {
                    const ext = assetName.split('.').pop()?.toLowerCase();
                    if (ext === 'jpg' || ext === 'jpeg') forcedMimeType = 'image/jpeg';
                    else if (ext === 'png') forcedMimeType = 'image/png';
                    else if (ext === 'gif') forcedMimeType = 'image/gif';
                    else if (ext === 'webp') forcedMimeType = 'image/webp';
                    else if (ext === 'svg') forcedMimeType = 'image/svg+xml';
                }

                const typedBlob = new Blob([blob], { type: forcedMimeType });
                const url = URL.createObjectURL(typedBlob);
                setBlobUrl(url);
            } else {
                let errorMessage = `Server returned ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMessage += `: ${errorData.message || errorData.error || response.statusText}`;
                } catch (e) {
                    errorMessage += `: ${response.statusText}`;
                }
                setFetchError(errorMessage);
            }
        } catch (error) {
            setFetchError(error instanceof Error ? error.message : 'An unexpected error occurred');
        } finally {
            setIsFetching(false);
        }
    };

    useEffect(() => {
        if (isOpen && assetUrl) {
            fetchAsset();
        }
    }, [isOpen, assetUrl]);

    useEffect(() => {
        if (isOpen) {
            setCopied(false);
            document.body.style.overflow = 'hidden';

            const tl = gsap.timeline();
            tl.to(overlayRef.current, { opacity: 1, duration: 0.3, ease: 'power2.out', display: 'flex' })
                .fromTo(modalRef.current,
                    { y: 50, opacity: 0, scale: 0.95 },
                    { y: 0, opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(1.5)' },
                    "-=0.1"
                );
        } else {
            document.body.style.overflow = 'auto';

            const tl = gsap.timeline();
            tl.to(modalRef.current, { y: 20, opacity: 0, scale: 0.95, duration: 0.2, ease: 'power2.in' })
                .to(overlayRef.current, { opacity: 0, duration: 0.2, ease: 'power2.in', display: 'none' });
        }
    }, [isOpen]);

    const handleCopy = (text: string) => {
        if (text) {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (!isOpen) { /* Using GSAP for unmount handling visually, but need to render it to animate */ }

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm opacity-0 hidden"
            style={{ display: isOpen ? 'flex' : 'none' }}
            onClick={(e) => {
                if (e.target === overlayRef.current) onClose();
            }}
        >
            <div ref={modalRef} className="w-full max-w-lg max-h-[95vh] flex">
                <GlassCard
                    className="w-full p-0 overflow-hidden bg-[#0A0A0A]/95 border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
                        <h3 className="text-lg font-semibold text-white">Asset Preview</h3>
                        <button
                            onClick={onClose}
                            className="p-2 transition-colors rounded-lg text-color-support hover:text-white hover:bg-white/10"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar">
                        {/* Preview Area */}
                        <div className="flex flex-col items-center justify-center w-full mb-6 overflow-hidden border border-dashed rounded-xl h-64 sm:h-80 border-white/20 bg-black/50 relative">
                            {isFetching ? (
                                <div className="flex flex-col items-center gap-3 text-color-support/60">
                                    <Loader2 size={48} className="animate-spin text-color-primary" />
                                    <p className="text-sm font-medium">Fetching secure content...</p>
                                </div>
                            ) : isProcessing ? (
                                <div className="flex flex-col items-center text-center px-10">
                                    <RefreshCw size={48} className="text-color-accent mb-4 animate-spin-slow" />
                                    <h4 className="text-lg font-semibold text-white mb-2">Processing on Network</h4>
                                    <p className="text-sm text-color-support/70 mb-6">This asset has been submitted but is still being indexed by the network nodes. Please wait a moment.</p>
                                    <button
                                        onClick={fetchAsset}
                                        className="px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white text-sm transition-all"
                                    >
                                        Check Status Again
                                    </button>
                                </div>
                            ) : fetchError ? (
                                <div className="flex flex-col items-center text-center px-10">
                                    <FileText size={48} className="text-red-400/50 mb-4" />
                                    <h4 className="text-lg font-semibold text-white mb-2">Preview Unavailable</h4>
                                    <p className="text-sm text-red-400/80 mb-6">{fetchError}</p>
                                    <button
                                        onClick={fetchAsset}
                                        className="px-6 py-2 rounded-full bg-color-primary/10 hover:bg-color-primary/20 border border-color-primary/20 text-color-primary text-sm transition-all"
                                    >
                                        Retry Fetch
                                    </button>
                                </div>
                            ) : blobUrl ? (
                                <>
                                    {isImage ? (
                                        <img
                                            src={blobUrl}
                                            alt={assetName}
                                            className="object-contain w-full h-full p-2"
                                        />
                                    ) : isPdf ? (
                                        <iframe
                                            src={`${blobUrl}#toolbar=0`}
                                            className="w-full h-full border-none"
                                            title="PDF Preview"
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center gap-4 text-color-support/40">
                                            <FileText size={80} strokeWidth={1} />
                                            <p className="text-sm font-medium">Preview not available for this file type</p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="flex items-center justify-center w-full h-full text-color-primary/40">
                                    <FileText size={64} className="opacity-50" />
                                </div>
                            )}
                        </div>

                        {/* Asset Info */}
                        <div className="mb-6">
                            <h4 className="text-xl font-medium text-white truncate" title={assetName}>{assetName}</h4>
                            <div className="flex gap-4 mt-2 text-sm text-color-support/60 font-mono">
                                <span>Size: {assetSizeStr} MB</span>
                            </div>
                        </div>

                        {/* Secure Hash & Explorer Actions */}
                        <div className="space-y-4">
                            {/* Content ID / Merkle Root */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold tracking-[0.2em] uppercase text-color-support/40">
                                    Content ID (Merkle Root)
                                </label>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 px-4 py-2.5 overflow-hidden border rounded-lg bg-black/40 border-white/5 text-color-support/60 font-mono text-[11px] whitespace-nowrap text-ellipsis">
                                        {assetHash || 'Processing...'}
                                    </div>
                                    <button
                                        onClick={() => handleCopy(assetHash)}
                                        disabled={!assetHash}
                                        className="p-2.5 transition-colors border rounded-lg bg-white/5 border-white/10 text-color-support hover:text-white hover:bg-white/10 disabled:opacity-30"
                                        title="Copy Hash"
                                    >
                                        {copied ? <CheckCircle size={16} className="text-green-400" /> : <Copy size={16} />}
                                    </button>
                                </div>
                            </div>

                            {/* Transaction Detail */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold tracking-[0.2em] uppercase text-color-support/40">
                                    Blockchain Footprint
                                </label>
                                {txHash ? (
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 px-4 py-2.5 overflow-hidden border rounded-lg bg-color-primary/5 border-color-primary/20 text-color-primary/80 font-mono text-[11px] whitespace-nowrap text-ellipsis">
                                                {txHash}
                                            </div>
                                            <button
                                                onClick={() => handleCopy(txHash)}
                                                className="p-2.5 transition-colors border rounded-lg bg-white/5 border-white/10 text-color-support hover:text-white"
                                                title="Copy Transaction Hash"
                                            >
                                                <Copy size={16} />
                                            </button>
                                        </div>
                                        <a 
                                            href={`https://explorer.aptoslabs.com/txn/${txHash}?network=testnet`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-color-primary/10 to-color-accent/10 border border-color-primary/20 text-color-primary hover:from-color-primary/20 hover:to-color-accent/20 transition-all text-xs font-bold uppercase tracking-wider group"
                                        >
                                            <LinkIcon size={14} className="group-hover:rotate-45 transition-transform" />
                                            View in Aptos Explorer
                                        </a>
                                    </div>
                                ) : (
                                    <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3 italic text-color-support/30 text-xs">
                                        <Loader2 size={12} className="animate-spin" />
                                        Waiting for transaction finality...
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col sm:flex-row justify-end items-stretch sm:items-center gap-3 pt-4 border-t border-white/5">
                                <button
                                    onClick={onClose}
                                    className="order-2 sm:order-1 flex items-center justify-center px-6 py-2.5 text-sm font-medium transition-all rounded-xl text-color-support/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={onDownload}
                                    disabled={!assetUrl}
                                    className="order-1 sm:order-2 flex items-center justify-center px-6 py-2.5 text-sm font-bold transition-all rounded-xl text-white bg-gradient-to-r from-color-primary to-color-accent hover:scale-[1.03] active:scale-[0.97] shadow-lg shadow-color-primary/20 disabled:opacity-50 disabled:hover:scale-100"
                                >
                                    <Download size={18} className="mr-2" />
                                    Download Asset
                                </button>
                            </div>
                        </div>
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}
