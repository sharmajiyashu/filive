import { Service } from 'typedi';
import Media, { IMedia } from '../../models/Media';
import AppLogger from '../../api/loaders/logger';

@Service()
export class MediaService {
    constructor() { }

    /**
     * Create a media record.
     */
    public async createMedia(data: Partial<IMedia>): Promise<IMedia> {
        try {
            const media = await Media.create(data);
            AppLogger.info(`✌️ Media record ${media._id} created successfully.`);
            return media;
        } catch (error) {
            AppLogger.error('❌ Error creating media record:', error);
            throw error;
        }
    }

    /**
     * Delete a media record.
     */
    public async deleteMedia(id: string): Promise<void> {
        try {
            await Media.findByIdAndDelete(id);
        } catch (error) {
            AppLogger.error('❌ Error deleting media record:', error);
        }
    }
}
