import { Service, Inject } from 'typedi';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import AppLogger from '../../api/loaders/logger';
import { MediaType } from '../../constants/enum';
import { randomUUID } from 'crypto';
import streamifier from 'streamifier';
import config from '../../config';

import { resolveMediaType } from '../../utils/mediaType';

export interface IMediaResult {
  type: MediaType;
  key: string;
  mimetype: string;
  url: string;
  size?: number;
  width?: number;
  height?: number;
}

@Service()
export class CloudinaryService {
  constructor(@Inject('cloudinaryClient') private readonly cloudinaryClient: typeof cloudinary) {}

  private getBaseUrl(): string {
    const raw = process.env.BACKEND_URL || process.env.APP_URL || config.backend?.url || 'https://filive.in';
    return raw.replace(/\/+$/, '');
  }

  private async uploadToLocalDisk(
    file: Express.Multer.File,
    folderPath: string,
    mediaType: MediaType
  ): Promise<IMediaResult> {
    try {
      const sanitizedFolder = (folderPath || 'defaults').replace(/[^a-zA-Z0-9_\-\/]/g, '');
      const targetFolder = path.join(process.cwd(), 'public', 'uploads', sanitizedFolder);
      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }

      const origExt = path.extname(file.originalname || '');
      const defaultExt = mediaType === MediaType.video ? '.mp4' : mediaType === MediaType.svga ? '.svga' : '.jpg';
      const ext = origExt && origExt.length <= 5 ? origExt : defaultExt;
      const filename = `${randomUUID()}${ext}`;
      const filePath = path.join(targetFolder, filename);

      fs.writeFileSync(filePath, file.buffer);

      const baseUrl = this.getBaseUrl();
      const publicUrl = `${baseUrl}/public/uploads/${sanitizedFolder}/${filename}`;

      AppLogger.info(`📁 Saved media locally: ${publicUrl}`);

      return {
        type: mediaType,
        key: `local_${sanitizedFolder}_${filename}`,
        mimetype: file.mimetype || (mediaType === MediaType.video ? 'video/mp4' : 'image/jpeg'),
        url: publicUrl,
        size: file.size || file.buffer?.length,
      };
    } catch (localErr: any) {
      AppLogger.error('❌ Local file save error:', localErr);
      throw new Error(`Media upload failed: ${localErr?.message || 'Local save error'}`);
    }
  }

  async uploadMedia(
    type: MediaType,
    files: Express.Multer.File[],
    folderPath: string
  ): Promise<IMediaResult[]> {
    const results: IMediaResult[] = [];

    for (const file of files) {
      const detectedType = resolveMediaType(file);
      const mediaType = (detectedType === MediaType.video || detectedType === MediaType.svga || !type || type === MediaType.image)
        ? detectedType
        : type;

      try {
        const result = await this.uploadToCloudinary(file.buffer, folderPath, mediaType);
        results.push({
          type: mediaType,
          key: result.public_id,
          mimetype: mediaType === MediaType.svga ? 'application/svga' : file.mimetype,
          url: result.secure_url,
          size: result.bytes,
          width: result.width,
          height: result.height
        });
      } catch (cloudinaryError: any) {
        AppLogger.warn(`⚠️ Cloudinary upload failed (${cloudinaryError?.message || 'disabled'}). Falling back to local storage.`);
        const localResult = await this.uploadToLocalDisk(file, folderPath, mediaType);
        results.push(localResult);
      }
    }

    return results;
  }

  private getCloudinaryResourceType(type: MediaType): 'video' | 'raw' | 'auto' {
    if (type === MediaType.video) return 'video';
    if (type === MediaType.svga) return 'raw';
    return 'auto';
  }

  private async uploadToCloudinary(
    buffer: Buffer,
    folder: string,
    type: MediaType
  ): Promise<UploadApiResponse> {
    const resourceType = this.getCloudinaryResourceType(type);
    const publicId = type === MediaType.svga ? `${randomUUID()}.svga` : randomUUID();

    return new Promise((resolve, reject) => {
      const uploadStream = this.cloudinaryClient.uploader.upload_stream(
        {
          folder: folder,
          resource_type: resourceType,
          public_id: publicId,
        },
        (error, result) => {
          if (error) {
            AppLogger.error('Cloudinary upload error:', error);
            return reject(error);
          }
          if (!result) {
            return reject(new Error('Cloudinary upload result is undefined'));
          }
          resolve(result);
        }
      );

      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }

  async deleteMedia(publicIds: string[]): Promise<void> {
    if (publicIds.length === 0) return;
    
    try {
      const cloudinaryIds = publicIds.filter(id => !id.startsWith('local_'));
      const localIds = publicIds.filter(id => id.startsWith('local_'));

      if (cloudinaryIds.length > 0) {
        await Promise.all(
          cloudinaryIds.map(id => 
            this.cloudinaryClient.uploader.destroy(id).catch(err => {
              AppLogger.warn(`Cloudinary destroy warning for ${id}: ${err?.message || err}`);
            })
          )
        );
      }

      for (const id of localIds) {
        try {
          const parts = id.replace(/^local_/, '').split('_');
          const filename = parts.pop();
          const folder = parts.join('_');
          if (folder && filename) {
            const filePath = path.join(process.cwd(), 'public', 'uploads', folder, filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }
        } catch {
          // Ignore local delete errors
        }
      }
    } catch (error) {
      AppLogger.error('Cloudinary delete error:', error);
    }
  }

  async uploadImageWithThumbnail(file: Express.Multer.File, folder: string) {
    try {
      const result = await this.uploadToCloudinary(file.buffer, folder, MediaType.image);
      const thumbUrl = this.cloudinaryClient.url(result.public_id, {
        width: 800,
        crop: 'scale',
        quality: 'auto'
      });

      return { 
        originalKey: result.public_id, 
        thumbUrl: thumbUrl,
        url: result.secure_url
      };
    } catch (err: any) {
      AppLogger.warn(`⚠️ Cloudinary uploadImageWithThumbnail failed (${err?.message || 'disabled'}). Falling back to local storage.`);
      const local = await this.uploadToLocalDisk(file, folder, MediaType.image);
      return {
        originalKey: local.key,
        thumbUrl: local.url,
        url: local.url
      };
    }
  }
}
