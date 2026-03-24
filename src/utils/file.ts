/**
 * Centralized utility for file type detection and categorization.
 */

export interface FileTypeInfo {
    isImage: boolean;
    isVideo: boolean;
    isAudio: boolean;
    isSpreadsheet: boolean;
    isPresentation: boolean;
    isArchive: boolean;
    isText: boolean;
    isPdf: boolean;
    isDocument: boolean; // General catch-all for docs
}

export const getFileType = (filename: string, mimeType?: string): FileTypeInfo => {
    const name = filename.toLowerCase();
    const type = mimeType?.toLowerCase() || '';

    const isImage = type.startsWith('image/') || !!name.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico|avif|heic)$/);
    const isVideo = type.startsWith('video/') || !!name.match(/\.(mp4|webm|ogg|mov|mkv|avi|m4v|flv|wmv|3gp)$/);
    const isAudio = type.startsWith('audio/') || !!name.match(/\.(mp3|wav|ogg|flac|aac|m4a|opus|wma)$/);
    
    const isSpreadsheet = !!name.match(/\.(xls|xlsx|ods|numbers|csv)$/);
    const isPresentation = !!name.match(/\.(ppt|pptx|odp|key)$/);
    const isArchive = !!name.match(/\.(zip|rar|7z|gz|tar)$/);
    const isPdf = !!name.match(/\.(pdf)$/);
    const isText = type.startsWith('text/') || !!name.match(/\.(txt|md|json|js|ts|tsx|jsx|html|css|py|go|rs|c|cpp|h|yaml|yml|toml|xml|sh|bash|zsh|fish|log|env|csv|sql|graphql|gql|ini|cfg|conf)$/);

    const isDocument = isPdf || isSpreadsheet || isPresentation || !!name.match(/\.(doc|docx|odt|rtf|epub|pages)$/);

    return {
        isImage,
        isVideo,
        isAudio,
        isSpreadsheet,
        isPresentation,
        isArchive,
        isText,
        isPdf,
        isDocument
    };
};
