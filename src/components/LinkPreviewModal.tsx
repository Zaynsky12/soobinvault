import React, { useEffect, useState } from 'react';
import { AlertCircle, Download, ExternalLink, FileText, Image as ImageIcon, Info, Lock, Unlock, Maximize2, RefreshCw, Trash2, X, Music, Video, Key, Settings, File as FileIcon, Archive, FileSpreadsheet, Presentation } from 'lucide-react';
import { decryptFile } from '../utils/crypto';
import { getFileType } from '../utils/file';
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
    onDelete?: () => void;
    isEncrypted?: boolean;
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
    accountAddress,
    onDelete,
    isEncrypted = true,
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

    const runDecryptionWithRetry = React.useCallback(async (retryCount = 0) => {
        if (!blobName || !blobAccount || !shelbyClient || !accountAddress) return;
        
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
            const rawBuffer = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
                rawBuffer.set(chunk, offset);
                offset += chunk.length;
            }

            if (!isEncrypted) {
                // --- PLAINTEXT: build blob URL directly ---
                const ext = assetName.split('.').pop()?.toLowerCase() || '';
                const mimeMap: Record<string, string> = {
                    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
                    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
                    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
                    mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', aac: 'audio/aac',
                    m4a: 'audio/mp4', ogg: 'audio/ogg',
                    pdf: 'application/pdf',
                    txt: 'text/plain', md: 'text/plain', json: 'application/json',
                };
                const mimeType = mimeMap[ext] || 'application/octet-stream';
                const blob = new Blob([rawBuffer], { type: mimeType });
                const url = URL.createObjectURL(blob);
                const name = assetName.toLowerCase();
                setDecryptedData({
                    url,
                    name: assetName,
                    type: mimeType,
                    isImage: !!name.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico|avif|heic)$/),
                    isVideo: !!name.match(/\.(mp4|webm|ogg|mov|mkv|avi|m4v|flv|wmv|3gp)$/),
                    isText: !!name.match(/\.(txt|md|json|js|ts|tsx|jsx|html|css|py|go|rs|c|cpp|h|yaml|yml|toml|xml|sh|log|env|csv|sql|ini|cfg|conf)$/),
                    isAudio: !!name.match(/\.(mp3|wav|flac|aac|m4a|opus|wma)$/),
                    isDocument: !!name.match(/\.(doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|rtf|epub|pages|numbers|key|zip|rar|7z|gz|tar)$/),
                });
                setIsProcessing(false);
                return;
            }

            // --- ENCRYPTED: decrypt ---            // 2. Decrypt
            const cryptoKey = await ensureKey();
            if (!cryptoKey) {
                throw new Error("Signature required for decryption.");
            }
            
            const { blob: decryptedBlob, metadata } = await decryptFile(rawBuffer, cryptoKey);

            // Re-wrap blob with correct MIME type detected from metadata name
            const ext = metadata.name.split('.').pop()?.toLowerCase() || '';
            const mimeMap: Record<string, string> = {
                jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
                webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', tiff: 'image/tiff',
                ico: 'image/x-icon', avif: 'image/avif',
                mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', mov: 'video/quicktime',
                mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', aac: 'audio/aac',
                m4a: 'audio/mp4',
                pdf: 'application/pdf',
                txt: 'text/plain', md: 'text/plain', json: 'application/json',
            };
            const forcedMimeType = mimeMap[ext] || metadata.type;
            const finalBlob = new Blob([decryptedBlob], { type: forcedMimeType });

            const url = URL.createObjectURL(finalBlob);
            const name = metadata.name.toLowerCase();

            setDecryptedData({
                url,
                name: metadata.name,
                type: forcedMimeType,
                isImage: !!name.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico|avif|heic)$/),
                isVideo: !!name.match(/\.(mp4|webm|ogg|mov|mkv|avi|m4v|flv|wmv|3gp)$/),
                isText: !!name.match(/\.(txt|md|json|js|ts|tsx|jsx|html|css|py|go|rs|c|cpp|h|yaml|yml|toml|xml|sh|bash|zsh|fish|log|env|csv|sql|graphql|gql|ini|cfg|conf)$/),
                isAudio: !!name.match(/\.(mp3|wav|ogg|flac|aac|m4a|opus|wma)$/),
                isDocument: !!name.match(/\.(doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|rtf|epub|pages|numbers|key|zip|rar|7z|gz|tar)$/),
            });
            setIsProcessing(false);
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            const is404 = errorMsg.includes('404') || errorMsg.toLowerCase().includes('not found');
            const isDecryptionError = errorMsg.toLowerCase().includes('decrypt') || errorMsg.toLowerCase().includes('session key');

            if (is404 && retryCount < 3) {
                const delay = 2000 * (retryCount + 1);
                console.log(`Retrying in ${delay}ms... (Attempt ${retryCount + 2})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return runDecryptionWithRetry(retryCount + 1);
            }

            if (!isEncrypted) {
                setFetchError(is404 ? 'INDEXING' : errorMsg);
            } else if (isDecryptionError) {
                setFetchError('DECRYPTION_FAILED');
            } else if (is404) {
                setFetchError('INDEXING');
            } else {
                setFetchError(errorMsg);
            }
            setIsProcessing(false);
        }
    }, [blobName, blobAccount, shelbyClient, accountAddress, ensureKey, isEncrypted, assetName]);

    useEffect(() => {
        if (isOpen) {
            runDecryptionWithRetry();
        } else {
            setDecryptedData(null);
        }
    }, [isOpen, runDecryptionWithRetry]);

    // Clean up URLs
    useEffect(() => {
        return () => {
            if (decryptedData?.url) URL.revokeObjectURL(decryptedData.url);
        };
    }, [decryptedData]);

    const isPdf = assetName.toLowerCase().endsWith('.pdf');

    const fetchAsset = async () => {
        if (!assetUrl && !onFetch) return;
        if (isEncrypted) {
            console.log('[LinkPreviewModal] isEncrypted is true, skipping direct fetchAsset path.');
            return;
        }

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
                // Also set decryptedData for text files to ensure the render logic works
                setDecryptedData({
                    url: URL.createObjectURL(rawBlob),
                    name: assetName,
                    type: 'text/plain',
                    isImage: false,
                    isVideo: false,
                    isText: true,
                    isAudio: false,
                    isDocument: false,
                });
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

            // CRITICAL: Update decryptedData for non-encrypted files so the UI renders them!
            setDecryptedData({
                url,
                name: assetName,
                type: forcedMimeType,
                isImage: !!assetName.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico|avif|heic)$/),
                isVideo: !!assetName.toLowerCase().match(/\.(mp4|webm|ogg|mov|mkv|avi|m4v|flv|wmv|3gp)$/),
                isText: !!assetName.toLowerCase().match(/\.(txt|md|json|js|ts|tsx|jsx|html|css|py|go|rs|c|cpp|h|yaml|yml|toml|xml|sh|bash|zsh|fish|log|env|csv|sql|graphql|gql|ini|cfg|conf)$/),
                isAudio: !!assetName.toLowerCase().match(/\.(mp3|wav|ogg|flac|aac|m4a|opus|wma)$/),
                isDocument: !!assetName.toLowerCase().match(/\.(doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|rtf|epub|pages|numbers|key|zip|rar|7z|gz|tar)$/),
            });
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
        if (isOpen && assetUrl && !isEncrypted) {
            fetchAsset();
        }
    }, [isOpen, assetUrl, isEncrypted]);

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
            className={`fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm transition-all duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            onClick={(e) => {
                if (e.target === overlayRef.current) onClose();
            }}
        >
            <div ref={modalRef} className="w-full max-w-2xl max-h-[calc(100dvh-2rem)] flex flex-col animate-in fade-in zoom-in-95 duration-300">
                <GlassCard className="w-full flex flex-col min-h-0 overflow-hidden bg-[#0A0A0A]/95 border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-[2rem] sm:rounded-3xl">
                    <div className="p-5 md:p-8 flex-1 flex flex-col overflow-y-auto custom-scrollbar relative z-10">
                        {/* Header */}
                        <div className="flex-shrink-0 flex items-center justify-between mb-4 md:mb-6">
                            <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-color-primary/10 flex items-center justify-center border border-color-primary/20 shrink-0">
                                    {decryptedData ? (
                                        <>
                                            <Unlock className="md:hidden text-color-primary" size={20} />
                                            <Unlock className="hidden md:block text-color-primary" size={24} />
                                        </>
                                    ) : (
                                        <>
                                            <Lock className="md:hidden text-color-support/40" size={20} />
                                            <Lock className="hidden md:block text-color-support/40" size={24} />
                                        </>
                                    )}
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <h2 className="text-lg md:text-xl font-bold text-white truncate leading-tight">
                                        {isProcessing ? (isEncrypted ? 'Decrypting...' : 'Loading...') : (decryptedData ? decryptedData.name : 'Vault Asset')}
                                    </h2>
                                    <p className="text-[10px] text-color-support/40 uppercase tracking-widest mt-0.5">
                                        {assetSizeStr} MB • {isEncrypted ? (decryptedData ? 'DECRYPTED' : 'ENCRYPTED') : 'PUBLIC'}
                                    </p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 md:p-3 rounded-xl hover:bg-white/10 text-color-support transition-colors active:scale-90">
                                <X className="md:hidden" size={20} />
                                <X className="hidden md:block" size={24} />
                            </button>
                        </div>

                        {/* Preview Content Area */}
                        <div className="flex-shrink-0 w-full bg-black/40 rounded-3xl border border-white/5 flex items-center justify-center relative min-h-[250px] sm:min-h-[400px] py-4 sm:py-6 overflow-hidden">
                            {isProcessing ? (
                                <div className="flex flex-col items-center gap-4">
                                    <div className="relative">
                                        <div className="w-16 h-16 rounded-full border-4 border-color-primary/20 border-t-color-primary animate-spin" />
                                        <Lock size={20} className="absolute inset-0 m-auto text-color-primary animate-pulse" />
                                    </div>
                                    <span className="text-color-primary font-mono text-xs tracking-[0.2em] uppercase animate-pulse">
                                        {isEncrypted ? 'Decrypting...' : 'Loading...'}
                                    </span>
                                </div>
                            ) : fetchError === 'DECRYPTION_FAILED' ? (
                                <div className="flex flex-col items-center justify-center gap-6 text-center px-4 md:px-12 py-6 md:py-16 w-full max-w-xl mx-auto">
                                    <div className="relative group scale-90 md:scale-100">
                                        <div className="absolute inset-0 bg-red-500/20 rounded-full blur-xl transition-all duration-500 animate-pulse" />
                                        <div className="w-20 h-20 rounded-full bg-gradient-to-b from-red-500/10 to-[#0A0A0A] flex items-center justify-center border border-red-500/30 relative z-10 shadow-[0_0_30px_rgba(239,68,68,0.15)]">
                                            <Lock size={32} className="text-red-400" strokeWidth={1.5} />
                                            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white border-4 border-[#0A0A0A] shadow-lg">
                                                <X size={14} strokeWidth={3} />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-2 w-full">
                                        <h3 className="text-xl md:text-3xl font-bold text-white tracking-tight">Access Denied</h3>
                                        <p className="text-color-support/60 text-xs md:text-base leading-relaxed max-w-sm mx-auto">
                                            Encryption key mismatch. Import your <b>Master Key</b> in Settings to unlock this asset.
                                        </p>
                                        
                                        <div className="mt-4 p-4 md:p-6 rounded-2xl bg-white/[0.03] border border-white/5 text-left space-y-3 w-full">
                                            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                                                <Key size={14} className="text-color-primary" />
                                                <h4 className="text-[10px] md:text-xs font-bold text-white uppercase tracking-wider">Instructions</h4>
                                            </div>
                                            
                                            <div className="space-y-3 pt-1">
                                                <div className="flex gap-2 items-center">
                                                    <div className="shrink-0 w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold text-color-support">1</div>
                                                    <p className="text-[11px] md:text-sm text-white/70">Click Settings (<Settings size={10} className="inline" />) in the navigation bar.</p>
                                                </div>
                                                <div className="flex gap-2 items-center">
                                                    <div className="shrink-0 w-5 h-5 rounded-full bg-color-primary/20 flex items-center justify-center text-[10px] font-bold text-color-primary border border-color-primary/30">2</div>
                                                    <p className="text-[11px] md:text-sm text-white/70">Select <b>Import Master Key</b> and paste your key.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <button 
                                        onClick={() => {
                                            onClose();
                                            setTimeout(() => {
                                                window.dispatchEvent(new CustomEvent('vault:openSettings'));
                                            }, 300);
                                        }}
                                        className="mt-2 px-8 py-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold transition-all text-xs w-full border border-white/10 active:scale-95 uppercase tracking-widest"
                                    >
                                        Open Settings
                                    </button>
                                </div>
                            ) : fetchError === 'INDEXING' ? (
                                <div className="flex flex-col items-center gap-6 text-center px-10">
                                    <div className="w-16 h-16 rounded-full border-4 border-color-primary/10 border-t-color-primary animate-spin" />
                                    <div className="space-y-2">
                                        <h3 className="text-white font-bold text-lg">Indexing Asset...</h3>
                                        <p className="text-color-support/60 text-sm max-w-xs">The file is being processed by the decentralized network. Please wait 1-2 minutes.</p>
                                    </div>
                                </div>
                            ) : fetchError ? (
                                <div className="flex flex-col items-center gap-4 text-center px-10">
                                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                                        <X size={32} className="text-red-500" />
                                    </div>
                                    <h3 className="text-white font-bold text-lg">Network Error</h3>
                                    <p className="text-color-support/60 text-sm max-w-xs font-mono text-[10px] break-all">{fetchError}</p>
                                    <button onClick={() => runDecryptionWithRetry(0)} className="mt-4 px-6 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold uppercase">Retry</button>
                                </div>
                            ) : decryptedData ? (
                                <div className="w-full h-full flex items-center justify-center">
                                    {decryptedData.isImage && (
                                        <img src={decryptedData.url} alt={decryptedData.name} className="max-w-full max-h-full object-contain" />
                                    )}
                                    {decryptedData.isVideo && (
                                        <video 
                                            src={decryptedData.url} 
                                            controls 
                                            className="max-w-full max-h-full" 
                                            autoPlay 
                                            muted 
                                            playsInline 
                                        />
                                    )}
                                    {decryptedData.isAudio && (
                                        <div className="flex flex-col items-center gap-6 p-12 glass-panel rounded-3xl border-white/10">
                                            <div className="w-24 h-24 rounded-full bg-color-primary/20 flex items-center justify-center">
                                                <FileIcon size={48} className="text-color-primary" />
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
                                            <FileIcon size={64} className="text-color-support/20" />
                                            <div>
                                                <h3 className="text-xl font-bold text-white mb-2">{isEncrypted ? 'Decrypted File' : 'File Asset'}</h3>
                                                <p className="text-color-support/60 text-sm">Preview not available for this format.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-4 opacity-20">
                                    <FileIcon size={64} />
                                </div>
                            )}
                        </div>

                        {/* Footer / Actions - Sticky or bottom flow */}
                        {fetchError !== 'DECRYPTION_FAILED' && (
                            <div className="flex-shrink-0 mt-6 md:mt-8 flex flex-col sm:flex-row items-center justify-end gap-3 border-t border-white/5 pt-6 md:pt-8 mb-2">
                                <button 
                                    onClick={onDelete || onClose} 
                                    className="w-full sm:w-auto px-8 py-4 md:py-3.5 rounded-2xl bg-red-500/5 hover:bg-red-500/10 text-red-500 font-bold transition-all order-2 sm:order-1 flex items-center justify-center gap-2 border border-red-500/10 uppercase text-xs tracking-widest"
                                >
                                    <Trash2 size={18} />
                                    Delete
                                </button>
                                <button
                                    onClick={() => {
                                        if (!decryptedData) return;
                                        const a = document.createElement('a');
                                        a.href = decryptedData.url;
                                        a.download = decryptedData.name;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                    }}
                                    disabled={!decryptedData}
                                    className="w-full sm:w-auto px-10 py-4 md:py-3.5 rounded-2xl bg-gradient-to-r from-color-primary to-color-accent hover:scale-[1.02] active:scale-[0.98] text-white font-bold transition-all shadow-lg shadow-color-primary/20 disabled:opacity-50 order-1 sm:order-2 uppercase text-xs tracking-widest"
                                >
                                    <Download size={20} className="inline-block mr-2" />
                                    Download
                                </button>
                            </div>
                        )}
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
                setText('Failed to load text content.');
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
    const Icon = isSpreadsheet ? FileSpreadsheet : isPresentation ? Presentation : isArchive ? Archive : FileIcon;

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
