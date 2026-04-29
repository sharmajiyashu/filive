import { v2 as cloudinary } from 'cloudinary';
import config from '../../config';
import AppLogger from './logger';

export default async (): Promise<typeof cloudinary> => {
    if (
        !config.cloudinary.cloudName ||
        !config.cloudinary.apiKey ||
        !config.cloudinary.apiSecret
    ) {
        throw new Error(
            'CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are not set in config'
        );
    }

    cloudinary.config({
        cloud_name: config.cloudinary.cloudName,
        api_key: config.cloudinary.apiKey,
        api_secret: config.cloudinary.apiSecret
    });

    AppLogger.info(`✌️ Cloudinary Client Loaded`);
    return cloudinary;
};
