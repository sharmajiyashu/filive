import Gift from '../models/Gift';
import Media from '../models/Media';
import AppLogger from '../api/loaders/logger';

export async function seedGifts() {
  try {
    const existingCount = await Gift.countDocuments();
    if (existingCount > 0) {
      AppLogger.info('Gifts already seeded, skipping...');
      return;
    }

    AppLogger.info('🌱 Seeding virtual gifts...');

    // 1. Create Media entries for gifts
    const giftMedias = [
      {
        name: 'Flower',
        url: 'https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=150&auto=format&fit=crop',
        type: 'Normal',
        price: 10,
      },
      {
        name: 'Heart',
        url: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=150&auto=format&fit=crop',
        type: 'Normal',
        price: 50,
      },
      {
        name: 'Diamond',
        url: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=150&auto=format&fit=crop',
        type: 'VIP',
        price: 200,
      },
      {
        name: 'Crown',
        url: 'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=150&auto=format&fit=crop',
        type: 'VIP',
        price: 500,
      },
      {
        name: 'Sports Car',
        url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=150&auto=format&fit=crop',
        type: 'Luxury',
        price: 1500,
      },
    ];

    for (const item of giftMedias) {
      const media = await Media.create({
        url: item.url,
        mimetype: 'image/jpeg',
        type: 'image',
      });

      await Gift.create({
        name: item.name,
        type: item.type,
        price: item.price,
        media: media._id,
        isActive: true,
      });
    }

    AppLogger.info('✅ Virtual gifts seeded successfully!');
  } catch (error) {
    AppLogger.error('❌ Gift seeder failed', error);
  }
}
