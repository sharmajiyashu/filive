import { MediaType } from '../constants/enum';

export const svgaMimeTypes = [
  'application/octet-stream',
  'application/svga',
  'image/svga',
  'application/x-svga',
];

export function isSvgaFile(file: Express.Multer.File): boolean {
  const ext = file.originalname?.split('.').pop()?.toLowerCase();
  return ext === 'svga' || svgaMimeTypes.includes(file.mimetype);
}

export function resolveMediaType(file: Express.Multer.File): MediaType {
  if (isSvgaFile(file)) {
    return MediaType.svga;
  }
  if (file.mimetype.startsWith('video/')) {
    return MediaType.video;
  }
  if (file.mimetype === 'image/gif') {
    return MediaType.gif;
  }
  if (file.mimetype === 'image/webp' || file.mimetype === 'image/svg+xml') {
    return MediaType.sticker;
  }
  if (file.mimetype.startsWith('image/')) {
    return MediaType.image;
  }
  if (file.mimetype.startsWith('audio/')) {
    return MediaType.audio;
  }
  return MediaType.other;
}
