import { v2 as cloudinary } from 'cloudinary';
import config from '../../config';
import AppLogger from './logger';

export default async (): Promise<typeof cloudinary> => {
    if (
        !config.cloudinary.cloudName ||
        !config.cloudinary.apiKey ||
        !config.cloudinary.apiSecret
    ) {
        AppLogger.warn(
            '⚠️ CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET not set in config. Local disk fallback will be used.'
        );
    }

    cloudinary.config({
        cloud_name: config.cloudinary.cloudName || 'disabled',
        api_key: config.cloudinary.apiKey || '',
        api_secret: config.cloudinary.apiSecret || ''
    });

    AppLogger.info(`✌️ Cloudinary Client Configured`);
    return cloudinary;
};
