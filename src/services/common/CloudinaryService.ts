import { Service, Inject } from 'typedi';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import AppLogger from '../../api/loaders/logger';
import { MediaType } from '../../constants/enum';
import { randomUUID } from 'crypto';
import streamifier from 'streamifier';

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

  async uploadMedia(
    type: MediaType,
    files: Express.Multer.File[],
    folderPath: string
  ): Promise<IMediaResult[]> {
    const results: IMediaResult[] = [];

    for (const file of files) {
      const result = await this.uploadToCloudinary(file.buffer, folderPath, type);
      
      results.push({
        type: type,
        key: result.public_id,
        mimetype: file.mimetype,
        url: result.secure_url,
        size: result.bytes,
        width: result.width,
        height: result.height
      });
    }

    return results;
  }

  private async uploadToCloudinary(
    buffer: Buffer,
    folder: string,
    type: MediaType
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = this.cloudinaryClient.uploader.upload_stream(
        {
          folder: folder,
          resource_type: type === MediaType.video ? 'video' : 'auto',
          public_id: randomUUID()
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
      await Promise.all(
        publicIds.map(id => 
          this.cloudinaryClient.uploader.destroy(id)
        )
      );
    } catch (error) {
      AppLogger.error('Cloudinary delete error:', error);
    }
  }

  async uploadImageWithThumbnail(file: Express.Multer.File, folder: string) {
    const result = await this.uploadToCloudinary(file.buffer, folder, MediaType.image);
    
    // Cloudinary handles transformations on the fly, but we can return the transformed URL if needed.
    // Or we can just return the same public_id and use Cloudinary's dynamic resizing.
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
  }
}
