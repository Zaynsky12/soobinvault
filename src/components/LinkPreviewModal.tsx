import React, { useEffect, useState } from 'react';
import { X, FileText, Download, Loader2, RefreshCw, Music, File, Archive, FileSpreadsheet, Presentation, Lock, Unlock } from 'lucide-react';
import { decryptFile } from '../utils/crypto';
import { useVaultKey } from '../context/VaultKeyContext';
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
    isAudio: boolean;
    isDocument: boolean;
    onDownload: () => void;
    apiKey?: string;
    onFetch?: () => Promise<ReadableStream<Uint8Array> | null>;
    blobAccount?: string;
    blobName?: string;
    shelbyClient?: any;
    accountAddress?: string;
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
    isAudio,
    isDocument,
    onDownload,
    apiKey: propApiKey,
    onFetch,
    blobAccount,
    blobName,
    shelbyClient,
    accountAddress
}: LinkPreviewModalProps) {
    const [copied, setCopied] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [textContent, setTextContent] = useState<string | null>(null);

    const modalRef = React.useRef<HTMLDivElement>(null);
    const overlayRef = React.useRef<HTMLDivElement>(null);

    const { ensureKey } = useVaultKey();

    const [decryptedData, setDecryptedData] = useState<{
        url: string;
        name: string;
        type: string;
        isImage: boolean;
        isVideo: boolean;
        isText: boolean;
        isAudio: boolean;
        isDocument: boolean;
    } | null>(null);

    useEffect(() => {
        if (!isOpen || !blobName || !blobAccount || !shelbyClient || !accountAddress) {
            setDecryptedData(null);
            return;
        }

        const runDecryptionWithRetry = async (retryCount = 0) => {
            setIsProcessing(true);
            setFetchError(null);
            try {
                // 1. Fetch
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
                const encryptedBuffer = new Uint8Array(totalLength);
                let offset = 0;
                for (const chunk of chunks) {
                    encryptedBuffer.set(chunk, offset);
                    offset += chunk.length;
                }

                // 2. Decrypt
                const cryptoKey = await ensureKey();
                if (!cryptoKey) {
                    throw new Error("Signature required for decryption.");
                }
                
                // Pass the Uint8Array directly to decryptFile for better compatibility
                const { blob, metadata } = await decryptFile(encryptedBuffer, cryptoKey);

                const url = URL.createObjectURL(blob);
                const name = metadata.name.toLowerCase();

                setDecryptedData({
                    url,
                    name: metadata.name,
                    type: metadata.type,
                    isImage: !!name.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico|avif|heic)$/),
                    isVideo: !!name.match(/\.(mp4|webm|ogg|mov|mkv|avi|m4v|flv|wmv|3gp)$/),
                    isText: !!name.match(/\.(txt|md|json|js|ts|tsx|jsx|html|css|py|go|rs|c|cpp|h|yaml|yml|toml|xml|sh|bash|zsh|fish|log|env|csv|sql|graphql|gql|ini|cfg|conf)$/),
                    isAudio: !!name.match(/\.(mp3|wav|ogg|flac|aac|m4a|opus|wma)$/),
                    isDocument: !!name.match(/\.(doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|rtf|epub|pages|numbers|key|zip|rar|7z|gz|tar)$/),
                });
                setIsProcessing(false);
            } catch (err) {
                console.error(`Decryption attempt ${retryCount + 1} failed:`, err);

                const errorMessage = err instanceof Error ? err.message : String(err);
                const is404 = errorMessage.includes('404') || errorMessage.toLowerCase().includes('not found');

                if (is404 && retryCount < 3) {
                    const delay = 3000 * (retryCount + 1);
                    console.log(`Retrying decryption in ${delay}ms... (Attempt ${retryCount + 1})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return runDecryptionWithRetry(retryCount + 1);
                }

                setFetchError(is404
                    ? 'File belum tersedia di jaringan (Indexing). Silakan tunggu beberapa saat dan coba lagi.'
                    : (err instanceof Error ? err.message : 'Gagal mendekripsi file. Pastikan Anda menyetujui tanda tangan wallet.'));
                setIsProcessing(false);
            }
        };

        runDecryptionWithRetry();
    }, [isOpen, blobName, blobAccount, accountAddress]);

    // Clean up URLs
    useEffect(() => {
        return () => {
            if (decryptedData?.url) URL.revokeObjectURL(decryptedData.url);
        };
    }, [decryptedData]);

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
                const apiKey = propApiKey || process.env.NEXT_PUBLIC_SHELBY_API_KEY || "aptoslabs_8nf7TvDNviM_BvorzGpZdTDDZPsPpPorTcctVeD9F45Fu";
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
            const ext = assetName.split('.').pop()?.toLowerCase() || '';
            let forcedMimeType = rawBlob.type;
            const mimeMap: Record<string, string> = {
                // Images
                jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
                webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', tiff: 'image/tiff',
                ico: 'image/x-icon', avif: 'image/avif',
                // Video
                mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', mov: 'video/quicktime',
                mkv: 'video/x-matroska', avi: 'video/x-msvideo', m4v: 'video/mp4',
                flv: 'video/x-flv', wmv: 'video/x-ms-wmv', '3gp': 'video/3gpp',
                // Audio
                mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', aac: 'audio/aac',
                m4a: 'audio/mp4', opus: 'audio/ogg', wma: 'audio/x-ms-wma',
                // PDF
                pdf: 'application/pdf',
            };
            if (mimeMap[ext]) forcedMimeType = mimeMap[ext];
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
            className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm transition-all duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            onClick={(e) => {
                if (e.target === overlayRef.current) onClose();
            }}
        >
            <div ref={modalRef} className="w-full max-w-2xl max-h-[92vh] sm:max-h-[85vh] flex">
                <GlassCard className="w-full p-0 overflow-hidden bg-[#0A0A0A]/95 border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col rounded-t-[2rem] sm:rounded-3xl">
                    <div className="p-4 md:p-8 flex flex-col h-full relative z-10">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-4 overflow-hidden">
                                <div className="w-12 h-12 rounded-xl bg-color-primary/10 flex items-center justify-center border border-color-primary/20 shrink-0">
                                    {decryptedData ? <Unlock className="text-color-primary" size={24} /> : <Lock className="text-color-support/40" size={24} />}
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <h2 className="text-xl font-bold text-white truncate leading-tight">
                                        {isProcessing ? "Mendekripsi..." : (decryptedData ? decryptedData.name : "Vault Asset")}
                                    </h2>
                                    <p className="text-xs text-color-support/60 uppercase tracking-widest mt-1">
                                        {assetSizeStr} MB • {decryptedData ? "SECURED WITH AES-256-GCM" : "ENCRYPTED PAYLOAD"}
                                    </p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-3 rounded-xl hover:bg-white/10 text-color-support transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        {/* Preview Content */}
                        <div className="flex-1 bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex items-center justify-center relative min-h-[400px]">
                            {isProcessing ? (
                                <div className="flex flex-col items-center gap-4">
                                    <div className="relative">
                                        <div className="w-16 h-16 rounded-full border-4 border-color-primary/20 border-t-color-primary animate-spin" />
                                        <Lock size={20} className="absolute inset-0 m-auto text-color-primary animate-pulse" />
                                    </div>
                                    <span className="text-color-primary font-mono text-xs tracking-[0.2em] uppercase animate-pulse">Decrypting...</span>
                                </div>
                            ) : fetchError ? (
                                <div className="flex flex-col items-center gap-4 text-center px-10">
                                    <Lock size={48} className="text-red-500/50 mb-2" />
                                    <h3 className="text-white font-bold text-lg">Decryption Failed</h3>
                                    <p className="text-color-support/60 text-sm max-w-xs">{fetchError}</p>
                                </div>
                            ) : decryptedData ? (
                                <>
                                    {decryptedData.isImage && (
                                        <img src={decryptedData.url} alt={decryptedData.name} className="max-w-full max-h-full object-contain" />
                                    )}
                                    {decryptedData.isVideo && (
                                        <video src={decryptedData.url} controls className="max-w-full max-h-full" autoPlay />
                                    )}
                                    {decryptedData.isAudio && (
                                        <div className="flex flex-col items-center gap-6 p-12 glass-panel rounded-3xl border-white/10">
                                            <div className="w-24 h-24 rounded-full bg-color-primary/20 flex items-center justify-center">
                                                <Music size={48} className="text-color-primary" />
                                            </div>
                                            <audio src={decryptedData.url} controls className="w-full max-w-sm h-10 filter invert brightness-125" />
                                        </div>
                                    )}
                                    {decryptedData.isText && (
                                        <div className="w-full h-full p-8 overflow-auto CustomScroll">
                                            <TextPreview url={decryptedData.url} />
                                        </div>
                                    )}
                                    {decryptedData.isDocument && (
                                        <DocumentPreviewCard name={decryptedData.name} extension={decryptedData.name.split('.').pop() || ''} />
                                    )}
                                    {!decryptedData.isImage && !decryptedData.isVideo && !decryptedData.isAudio && !decryptedData.isText && !decryptedData.isDocument && (
                                        <div className="flex flex-col items-center gap-6 p-12 text-center">
                                            <File size={64} className="text-color-support/20" />
                                            <div>
                                                <h3 className="text-xl font-bold text-white mb-2">Decrypted File</h3>
                                                <p className="text-color-support/60 text-sm">Preview not available for this format.</p>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="flex flex-col items-center gap-4 opacity-20">
                                    <File size={64} />
                                </div>
                            )}
                        </div>

                        {/* Footer / Actions */}
                        <div className="mt-8 flex flex-col sm:flex-row items-center justify-end gap-4 border-t border-white/5 pt-8">
                            <button onClick={onClose} className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-color-support font-medium transition-all">
                                Close
                            </button>
                            <button
                                onClick={() => {
                                    if (!decryptedData) return;
                                    const a = document.createElement('a');
                                    a.href = decryptedData.url;
                                    a.download = decryptedData.name;
                                    a.click();
                                }}
                                disabled={!decryptedData}
                                className="w-full sm:w-auto px-10 py-3 rounded-2xl bg-gradient-to-r from-color-primary to-color-accent hover:scale-[1.02] active:scale-[0.98] text-white font-bold transition-all shadow-lg shadow-color-primary/20 disabled:opacity-50"
                            >
                                <Download size={20} className="inline-block mr-2" />
                                Download Original
                            </button>
                        </div>
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}

function TextPreview({ url }: { url: string }) {
    const [text, setText] = useState<string>('Loading content...');

    useEffect(() => {
        fetch(url)
            .then(res => res.text())
            .then(setText)
            .catch(err => {
                console.error('Failed to load text:', err);
                setText('Gagal memuat konten teks.');
            });
    }, [url]);

    return (
        <pre className="text-color-support/80 font-mono text-sm leading-relaxed whitespace-pre-wrap break-all">
            {text}
        </pre>
    );
}

function DocumentPreviewCard({ name, extension }: { name: string; extension: string }) {
    const isSpreadsheet = ['xls', 'xlsx', 'ods', 'numbers', 'csv'].includes(extension.toLowerCase());
    const isPresentation = ['ppt', 'pptx', 'odp', 'key'].includes(extension.toLowerCase());
    const isArchive = ['zip', 'rar', '7z', 'gz', 'tar'].includes(extension.toLowerCase());
    const Icon = isSpreadsheet ? FileSpreadsheet : isPresentation ? Presentation : isArchive ? Archive : File;

    return (
        <div className="flex flex-col items-center gap-6 p-12 text-center">
            <div className="w-28 h-28 rounded-[2rem] bg-gradient-to-br from-white/[0.03] to-white/[0.08] flex items-center justify-center border border-white/10 shadow-2xl group-hover/preview:scale-110 group-hover/preview:border-color-primary/30 transition-all duration-500">
                <Icon size={56} className="text-color-primary/50" />
            </div>
            <div className="space-y-2">
                <h3 className="text-xl font-bold text-white max-w-xs truncate">{name}</h3>
                <div className="flex justify-center">
                    <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest text-color-support/40">
                        .{extension} Document
                    </span>
                </div>
            </div>
        </div>
    );
}
