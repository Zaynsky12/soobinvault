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
    isVideo: boolean;
    isText: boolean;
    onDownload: () => void;
    apiKey?: string;
    onFetch?: () => Promise<ReadableStream<Uint8Array> | null>;
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
    isVideo,
    isText,
    onDownload,
    apiKey: propApiKey,
    onFetch
}: LinkPreviewModalProps) {
    const [copied, setCopied] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [textContent, setTextContent] = useState<string | null>(null);

    const modalRef = React.useRef<HTMLDivElement>(null);
    const overlayRef = React.useRef<HTMLDivElement>(null);

    const isPdf = assetName.toLowerCase().endsWith('.pdf');

    const fetchAsset = async () => {
        if (!assetUrl && !onFetch) return;

        setIsFetching(true);
        setFetchError(null);
        setIsProcessing(false);

        if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
            setBlobUrl(null);
        }

        try {
            let rawBlob: Blob;

            if (onFetch) {
                // Use SDK method via callback - handles auth internally
                const stream = await onFetch();
                if (!stream) {
                    setIsProcessing(true);
                    return;
                }
                const reader = stream.getReader();
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
                rawBlob = new Blob([merged]);
            } else {
                const apiKey = propApiKey || process.env.NEXT_PUBLIC_SHELBY_API_KEY || "aptoslabs_8TvZJ1y8YXj_QKYMB9C3GLUmcEMbvtXVscowf3xfwjTTW";
                console.log(`[LinkPreviewModal] Fetching with key prefix: ${apiKey.substring(0, 10)}...`);
                const response = await fetch(assetUrl!, {
                    headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
                });
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const data = await response.json();
                    if (data.error && data.error.toLowerCase().includes('not yet been marked successfully written')) {
                        setIsProcessing(true);
                    } else {
                        setFetchError(data.message || data.error || 'Failed to fetch asset');
                    }
                    return;
                } else if (!response.ok) {
                    let errorMessage = `Server returned ${response.status}`;
                    try {
                        const text = await response.text();
                        try {
                            const errorData = JSON.parse(text);
                            errorMessage += `: ${errorData.message || errorData.error || response.statusText}`;
                        } catch (e) {
                            errorMessage += `: ${text || response.statusText}`;
                        }
                    } catch (e) {
                        errorMessage += `: ${response.statusText}`;
                    }
                    console.error(`[LinkPreviewModal] Preview fetch failed:`, errorMessage, assetUrl);
                    setFetchError(errorMessage);
                    return;
                }
                rawBlob = await response.blob();
            }

            if (isText) {
                const text = await rawBlob.text();
                setTextContent(text);
                return;
            }

            // Force correct MIME type for previewing
            let forcedMimeType = rawBlob.type;
            if (isPdf) {
                forcedMimeType = 'application/pdf';
            } else if (isImage) {
                const ext = assetName.split('.').pop()?.toLowerCase();
                if (ext === 'jpg' || ext === 'jpeg') forcedMimeType = 'image/jpeg';
                else if (ext === 'png') forcedMimeType = 'image/png';
                else if (ext === 'gif') forcedMimeType = 'image/gif';
                else if (ext === 'webp') forcedMimeType = 'image/webp';
                else if (ext === 'svg') forcedMimeType = 'image/svg+xml';
            } else if (isVideo) {
                const ext = assetName.split('.').pop()?.toLowerCase();
                if (ext === 'mp4') forcedMimeType = 'video/mp4';
                else if (ext === 'webm') forcedMimeType = 'video/webm';
                else if (ext === 'ogg') forcedMimeType = 'video/ogg';
                else forcedMimeType = 'video/mp4'; // fallback
            }
            const typedBlob = new Blob([rawBlob], { type: forcedMimeType });
            const url = URL.createObjectURL(typedBlob);
            setBlobUrl(url);
        } catch (error: any) {
            console.error('[LinkPreviewModal] Fetch error:', error);
            // If 401/not-found style errors from SDK
            if (error?.message?.includes('not yet been marked')) {
                setIsProcessing(true);
            } else {
                setFetchError(error instanceof Error ? error.message : 'An unexpected error occurred');
            }
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
            document.body.classList.add('preview-open');

            const isMobile = window.innerWidth < 640;
            const tl = gsap.timeline();
            tl.to(overlayRef.current, { opacity: 1, duration: 0.3, ease: 'power2.out', display: 'flex' })
                .fromTo(modalRef.current,
                    { y: isMobile ? 100 : 50, opacity: 0, scale: isMobile ? 1 : 0.95 },
                    { y: 0, opacity: 1, scale: 1, duration: 0.4, ease: isMobile ? 'power2.out' : 'back.out(1.5)' },
                    "-=0.1"
                );
        } else {
            document.body.style.overflow = 'auto';
            document.body.classList.remove('preview-open');

            const isMobile = window.innerWidth < 640;
            const tl = gsap.timeline();
            tl.to(modalRef.current, { 
                y: isMobile ? 100 : 20, 
                opacity: 0, 
                scale: isMobile ? 1 : 0.95, 
                duration: 0.2, 
                ease: 'power2.in' 
            })
                .to(overlayRef.current, { opacity: 0, duration: 0.2, ease: 'power2.in', display: 'none' });
            
            // Cleanup
            if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
                setBlobUrl(null);
            }
            setTextContent(null);
            setIsProcessing(false);
            setFetchError(null);
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
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm opacity-0 hidden"
            style={{ display: isOpen ? 'flex' : 'none' }}
            onClick={(e) => {
                if (e.target === overlayRef.current) onClose();
            }}
        >
            <div ref={modalRef} className="w-full max-w-lg max-h-[92vh] sm:max-h-[90vh] flex">
                <GlassCard
                    className="w-full p-0 overflow-hidden bg-[#0A0A0A]/95 border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col rounded-t-[2rem] sm:rounded-[2rem]"
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
                                    ) : isVideo ? (
                                        <video
                                            src={blobUrl}
                                            controls
                                            className="w-full h-full object-contain"
                                        />
                                    ) : isText ? (
                                        <div className="w-full h-full p-4 overflow-auto bg-[#0a0a0a] text-color-support/80 font-mono text-xs leading-relaxed whitespace-pre">
                                            {textContent || "Loading content..."}
                                        </div>
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

                        {/* Actions */}
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
                                Download
                            </button>
                        </div>
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}
