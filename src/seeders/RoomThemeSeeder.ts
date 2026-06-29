import RoomTheme from '../models/RoomTheme';
import Media from '../models/Media';
import AppLogger from '../api/loaders/logger';

export async function seedRoomThemes() {
  try {
    const existingCount = await RoomTheme.countDocuments();
    if (existingCount > 0) {
      AppLogger.info('Room themes already seeded, skipping...');
      return;
    }

    AppLogger.info('🌱 Seeding room background themes...');

    const themes = [
      {
        name: 'Retro Disco',
        url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1080&auto=format&fit=crop',
      },
      {
        name: 'Cozy Fireplace',
        url: 'https://images.unsplash.com/photo-1545048702-79362596cdc9?w=1080&auto=format&fit=crop',
      },
      {
        name: 'Cyberpunk Neon',
        url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1080&auto=format&fit=crop',
      },
      {
        name: 'Lofi Chill Room',
        url: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=1080&auto=format&fit=crop',
      },
    ];

    for (const theme of themes) {
      const media = await Media.create({
        url: theme.url,
        mimetype: 'image/jpeg',
        type: 'image',
      });

      await RoomTheme.create({
        name: theme.name,
        media: media._id,
        isActive: true,
      });
    }

    AppLogger.info('✅ Room background themes seeded successfully!');
  } catch (error) {
    AppLogger.error('❌ Room themes seeder failed', error);
  }
}
