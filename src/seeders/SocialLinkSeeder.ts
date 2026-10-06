import SocialLink from '../models/SocialLink';
import AppLogger from '../api/loaders/logger';

export const DEFAULT_SOCIAL_PLATFORMS = [
  {
    name: 'WhatsApp',
    platformKey: 'whatsapp',
    icon: 'assets/images/whatsapp.png',
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
    icon: 'assets/images/instagram.png',
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
    icon: 'assets/images/telegram.png',
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
    icon: 'assets/images/facebook.png',
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
    icon: 'assets/images/youtube.png',
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
    icon: 'assets/images/linkdin.png',
    handle: '@filiveofficial',
    url: 'https://linkedin.com/company/filive',
    actionText: 'FOLLOW',
    color: '#0A66C2',
    order: 6,
    isActive: true,
  },
];

export async function seedSocialLinks() {
  try {
    AppLogger.info('🌱 Seeding default Social Links...');

    for (const item of DEFAULT_SOCIAL_PLATFORMS) {
      const existing = await SocialLink.findOne({
        $or: [{ platformKey: item.platformKey }, { name: item.name }],
      });

      if (!existing) {
        await SocialLink.create(item);
      }
    }

    AppLogger.info('✅ Social Links seeded successfully');
  } catch (error) {
    AppLogger.error('❌ Error seeding social links:', error);
  }
}
