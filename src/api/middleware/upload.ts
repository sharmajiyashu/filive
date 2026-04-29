import multer from 'multer';
import { Request } from 'express';

const storage = multer.memoryStorage();

export const imageTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
export const gifTypes = ['image/gif'];
export const stickerTypes = ['image/webp', 'image/svg+xml'];
export const videoTypes = [
    'video/mp4',
    'video/avi',
    'video/mov',
    'video/wmv',
    'video/flv',
    'video/webm'
];
export const audioTypes = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/aac',
    'audio/m4a'
];
export const documentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
];

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedTypes = [
        ...imageTypes,
        ...videoTypes,
        ...audioTypes,
        ...gifTypes,
        ...stickerTypes,
        ...documentTypes
    ];
    if (allowedTypes.includes(file.mimetype)) {
        const isImage = imageTypes.includes(file.mimetype);
        const isVideo = videoTypes.includes(file.mimetype);
        const isAudio = audioTypes.includes(file.mimetype);
        const isGif = gifTypes.includes(file.mimetype);
        const isSticker = stickerTypes.includes(file.mimetype);
        const isDocument = documentTypes.includes(file.mimetype);
        let maxSize: number;
        if (isImage) {
            maxSize = 5 * 1024 * 1024; // 5MB
        } else if (isGif) {
            maxSize = 1 * 1024 * 1024; // 1MB for GIFs
        } else if (isSticker) {
            maxSize = 1 * 1024 * 1024; // 1MB for stickers
        } else if (isVideo) {
            maxSize = 50 * 1024 * 1024; // 50MB
        } else if (isAudio) {
            maxSize = 10 * 1024 * 1024; // 10MB
        } else if (isDocument) {
            maxSize = 50 * 1024 * 1024; // 50MB
        } else {
            maxSize = 50 * 1024 * 1024; // 50MB default
        }

        if (file.size && file.size > maxSize) {
            let type = 'file';
            if (isImage) type = 'image';
            else if (isGif) type = 'gif';
            else if (isSticker) type = 'sticker';
            else if (isVideo) type = 'video';
            else if (isAudio) type = 'audio';
            else if (isDocument) type = 'document';

            cb(new Error(`${type} file size exceeds allowed limit`));
            return;
        }

        cb(null, true);
    } else {
        const errorMessage = `Invalid file type for ${file.originalname} (${file.mimetype}). Only jpeg, png, jpg images, gif, webp, svg, mp4, avi, mov, wmv, flv, webm, video, audio, document are allowed.`;
        cb(new Error(errorMessage));
    }
};

const upload = multer({
    // storage: storage,
    // limits: {
    //     fileSize: 1024 * 1024 * 50
    // },
    // fileFilter: fileFilter

    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB optional
});

export default upload;
