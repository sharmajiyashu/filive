import { Service } from 'typedi';
import SocialLink, { ISocialLink } from '../../models/SocialLink';
import AppLogger from '../../api/loaders/logger';

@Service()
export class SocialLinkService {
  private async ensureDefaultPresets(): Promise<void> {
    const count = await SocialLink.countDocuments();
    if (count === 0) {
      const presets = [
        {
          name: 'WhatsApp',
          platformKey: 'whatsapp',
          handle: '+91 98765 43210',
          url: 'https://wa.me/919876543210',
          actionText: 'CHAT',
          color: '#25D366',
          order: 1,
          isActive: true,
        },
        {
          name: 'Instagram',
          platformKey: 'instagram',
          handle: '@filiveofficial',
          url: 'https://instagram.com/filiveofficial',
          actionText: 'FOLLOW',
          color: '#E4405F',
          order: 2,
          isActive: true,
        },
        {
          name: 'Telegram',
          platformKey: 'telegram',
          handle: '@filiveofficial',
          url: 'https://t.me/filiveofficial',
          actionText: 'JOIN',
          color: '#0088CC',
          order: 3,
          isActive: true,
        },
        {
          name: 'Facebook',
          platformKey: 'facebook',
          handle: '@filiveofficial',
          url: 'https://facebook.com/filiveofficial',
          actionText: 'FOLLOW',
          color: '#1877F2',
          order: 4,
          isActive: true,
        },
        {
          name: 'YouTube',
          platformKey: 'youtube',
          handle: '@filiveofficial',
          url: 'https://youtube.com/@filiveofficial',
          actionText: 'VISIT',
          color: '#FF0000',
          order: 5,
          isActive: true,
        },
        {
          name: 'LinkedIn',
          platformKey: 'linkedin',
          handle: '@filiveofficial',
          url: 'https://linkedin.com/company/filive',
          actionText: 'FOLLOW',
          color: '#0A66C2',
          order: 6,
          isActive: true,
        },
      ];
      await SocialLink.insertMany(presets);
      AppLogger.info('[SocialLinkService: ensureDefaultPresets] Initialized default social presets');
    }
  }

  /**
   * Get all social links for Admin panel (sorted by order, then createdAt)
   */
  public async getAllSocialLinks(): Promise<ISocialLink[]> {
    await this.ensureDefaultPresets();
    return await SocialLink.find().sort({ order: 1, createdAt: 1 });
  }

  /**
   * Get only active social links for Mobile App (sorted by order, then createdAt)
   */
  public async getActiveSocialLinks(): Promise<ISocialLink[]> {
    await this.ensureDefaultPresets();
    return await SocialLink.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
  }

  /**
   * Get a single social link by ID
   */
  public async getSocialLinkById(id: string): Promise<ISocialLink | null> {
    return await SocialLink.findById(id);
  }

  /**
   * Create a new social link platform
   */
  public async createSocialLink(data: {
    name: string;
    platformKey?: string;
    icon?: string;
    handle?: string;
    url: string;
    actionText?: string;
    color?: string;
    order?: number;
    isActive?: boolean;
  }): Promise<ISocialLink> {
    AppLogger.info(`[SocialLinkService: createSocialLink] Creating platform: ${data.name}`);
    return await SocialLink.create({
      name: data.name.trim(),
      platformKey: (data.platformKey || 'custom').toLowerCase().trim(),
      icon: (data.icon || '').trim(),
      handle: (data.handle || '').trim(),
      url: data.url.trim(),
      actionText: (data.actionText || 'FOLLOW').toUpperCase().trim(),
      color: (data.color || '#F905B2').trim(),
      order: typeof data.order === 'number' ? data.order : 0,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    });
  }

  /**
   * Update an existing social link platform
   */
  public async updateSocialLink(
    id: string,
    data: {
      name?: string;
      platformKey?: string;
      icon?: string;
      handle?: string;
      url?: string;
      actionText?: string;
      color?: string;
      order?: number;
      isActive?: boolean;
    }
  ): Promise<ISocialLink> {
    AppLogger.info(`[SocialLinkService: updateSocialLink] Updating platform ID: ${id}`);
    const updatePayload: any = {};

    if (data.name !== undefined) updatePayload.name = data.name.trim();
    if (data.platformKey !== undefined) updatePayload.platformKey = data.platformKey.toLowerCase().trim();
    if (data.icon !== undefined) updatePayload.icon = data.icon.trim();
    if (data.handle !== undefined) updatePayload.handle = data.handle.trim();
    if (data.url !== undefined) updatePayload.url = data.url.trim();
    if (data.actionText !== undefined) updatePayload.actionText = data.actionText.toUpperCase().trim();
    if (data.color !== undefined) updatePayload.color = data.color.trim();
    if (data.order !== undefined) updatePayload.order = Number(data.order);
    if (data.isActive !== undefined) updatePayload.isActive = Boolean(data.isActive);

    const updated = await SocialLink.findByIdAndUpdate(id, updatePayload, { new: true });
    if (!updated) {
      throw new Error('Social link platform not found');
    }
    return updated;
  }

  /**
   * Delete a social link platform
   */
  public async deleteSocialLink(id: string): Promise<boolean> {
    AppLogger.info(`[SocialLinkService: deleteSocialLink] Deleting platform ID: ${id}`);
    const deleted = await SocialLink.findByIdAndDelete(id);
    if (!deleted) {
      throw new Error('Social link platform not found');
    }
    return true;
  }

  /**
   * Toggle active/inactive status
   */
  public async toggleStatus(id: string): Promise<ISocialLink> {
    const existing = await SocialLink.findById(id);
    if (!existing) {
      throw new Error('Social link platform not found');
    }
    existing.isActive = !existing.isActive;
    await existing.save();
    return existing;
  }
}
