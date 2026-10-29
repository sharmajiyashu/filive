import fs from 'fs';
import path from 'path';
import Level from '../models/Level';
import Media from '../models/Media';
import AppLogger from '../api/loaders/logger';
import { v2 as cloudinary } from 'cloudinary';

interface LevelSeedDef {
  levelNumber: number;
  type: 'rich' | 'charm';
  name: string;
  minCoins: number;
  maxCoins: number;
  color: string;
  secondaryColor?: string;
  rangeText: string;
  iconFilename: string;
  badgeType?: 'image' | 'svga' | 'gradient';
}

export const DEFAULT_LEVEL_DEFINITIONS: LevelSeedDef[] = [
  // ─── RICH (WEALTH) LEVELS ───────────────────────────────────────────
  {
    levelNumber: 0,
    type: 'rich',
    name: 'Wealth 0',
    minCoins: 0,
    maxCoins: 0,
    color: '#CD7F32',
    secondaryColor: '#8B4513',
    rangeText: '0',
    iconFilename: 'medal0.png',
    badgeType: 'image',
  },
  {
    levelNumber: 1,
    type: 'rich',
    name: 'Wealth 1-9',
    minCoins: 0,
    maxCoins: 20000,
    color: '#FF4B8A',
    secondaryColor: '#FF0066',
    rangeText: '1-9',
    iconFilename: 'medal9.png',
    badgeType: 'image',
  },
  {
    levelNumber: 10,
    type: 'rich',
    name: 'Wealth 10-19',
    minCoins: 20000,
    maxCoins: 100000,
    color: '#6A85F1',
    secondaryColor: '#B06AB3',
    rangeText: '10-19',
    iconFilename: 'medal2.png',
    badgeType: 'image',
  },
  {
    levelNumber: 20,
    type: 'rich',
    name: 'Wealth 20-29',
    minCoins: 100000,
    maxCoins: 300000,
    color: '#FFD700',
    secondaryColor: '#FF8C00',
    rangeText: '20-29',
    iconFilename: 'medal3.png',
    badgeType: 'image',
  },
  {
    levelNumber: 30,
    type: 'rich',
    name: 'Wealth 30-39',
    minCoins: 300000,
    maxCoins: 700000,
    color: '#7C6FCD',
    secondaryColor: '#534292',
    rangeText: '30-39',
    iconFilename: 'level_30_to_39_bg.svga',
    badgeType: 'svga',
  },
  {
    levelNumber: 40,
    type: 'rich',
    name: 'Wealth 40-49',
    minCoins: 700000,
    maxCoins: 1500000,
    color: '#E040FB',
    secondaryColor: '#AA00FF',
    rangeText: '40-49',
    iconFilename: 'level_40_to_49_bg.svga',
    badgeType: 'svga',
  },
  {
    levelNumber: 50,
    type: 'rich',
    name: 'Wealth 50-59',
    minCoins: 1500000,
    maxCoins: 3000000,
    color: '#FF5722',
    secondaryColor: '#E64A19',
    rangeText: '50-59',
    iconFilename: 'level_50_to_59_bg.svga',
    badgeType: 'svga',
  },
  {
    levelNumber: 60,
    type: 'rich',
    name: 'Wealth 60-69',
    minCoins: 3000000,
    maxCoins: 6000000,
    color: '#00E676',
    secondaryColor: '#00C853',
    rangeText: '60-69',
    iconFilename: 'level_60_to_69_bg.svga',
    badgeType: 'svga',
  },
  {
    levelNumber: 70,
    type: 'rich',
    name: 'Wealth 70-79',
    minCoins: 6000000,
    maxCoins: 10000000,
    color: '#00B0FF',
    secondaryColor: '#0091EA',
    rangeText: '70-79',
    iconFilename: 'level_70_to_79_bg.svga',
    badgeType: 'svga',
  },
  {
    levelNumber: 80,
    type: 'rich',
    name: 'Wealth 80-89',
    minCoins: 10000000,
    maxCoins: 16000000,
    color: '#651FFF',
    secondaryColor: '#6200EA',
    rangeText: '80-89',
    iconFilename: 'level_80_to_89_bg.svga',
    badgeType: 'svga',
  },
  {
    levelNumber: 90,
    type: 'rich',
    name: 'Wealth 90-99',
    minCoins: 16000000,
    maxCoins: 25000000,
    color: '#FF1744',
    secondaryColor: '#D50000',
    rangeText: '90-99',
    iconFilename: 'level_90_to_99_bg.svga',
    badgeType: 'svga',
  },
  {
    levelNumber: 100,
    type: 'rich',
    name: 'Wealth 100',
    minCoins: 25000000,
    maxCoins: 50000000,
    color: '#FFD700',
    secondaryColor: '#FFA000',
    rangeText: '100',
    iconFilename: 'level_100_bg.svga',
    badgeType: 'svga',
  },

  // ─── CHARM LEVELS ───────────────────────────────────────────────────
  {
    levelNumber: 0,
    type: 'charm',
    name: 'Charm 0',
    minCoins: 0,
    maxCoins: 0,
    color: '#FFB6C1',
    secondaryColor: '#FFD1DC',
    rangeText: '0',
    iconFilename: 'medal0.png',
    badgeType: 'image',
  },
  {
    levelNumber: 1,
    type: 'charm',
    name: 'Charm 1-9',
    minCoins: 0,
    maxCoins: 20000,
    color: '#84E34A',
    secondaryColor: '#28B446',
    rangeText: '1-9',
    iconFilename: 'medal1.png',
    badgeType: 'image',
  },
  {
    levelNumber: 10,
    type: 'charm',
    name: 'Charm 10-19',
    minCoins: 20000,
    maxCoins: 100000,
    color: '#00C6FF',
    secondaryColor: '#0072FF',
    rangeText: '10-19',
    iconFilename: 'medal2.png',
    badgeType: 'image',
  },
  {
    levelNumber: 20,
    type: 'charm',
    name: 'Charm 20-29',
    minCoins: 100000,
    maxCoins: 300000,
    color: '#FF245D',
    secondaryColor: '#FF00BE',
    rangeText: '20-29',
    iconFilename: 'medal3.png',
    badgeType: 'image',
  },
  {
    levelNumber: 30,
    type: 'charm',
    name: 'Charm 30-39',
    minCoins: 300000,
    maxCoins: 700000,
    color: '#7C6FCD',
    secondaryColor: '#534292',
    rangeText: '30-39',
    iconFilename: 'level_30_to_39_bg.svga',
    badgeType: 'svga',
  },
  {
    levelNumber: 40,
    type: 'charm',
    name: 'Charm 40-49',
    minCoins: 700000,
    maxCoins: 1500000,
    color: '#E040FB',
    secondaryColor: '#AA00FF',
    rangeText: '40-49',
    iconFilename: 'level_40_to_49_bg.svga',
    badgeType: 'svga',
  },
  {
    levelNumber: 50,
    type: 'charm',
    name: 'Charm 50-59',
    minCoins: 1500000,
    maxCoins: 3000000,
    color: '#FF5722',
    secondaryColor: '#E64A19',
    rangeText: '50-59',
    iconFilename: 'level_50_to_59_bg.svga',
    badgeType: 'svga',
  },
  {
    levelNumber: 60,
    type: 'charm',
    name: 'Charm 60-69',
    minCoins: 3000000,
    maxCoins: 6000000,
    color: '#00E676',
    secondaryColor: '#00C853',
    rangeText: '60-69',
    iconFilename: 'level_60_to_69_bg.svga',
    badgeType: 'svga',
  },
  {
    levelNumber: 70,
    type: 'charm',
    name: 'Charm 70-79',
    minCoins: 6000000,
    maxCoins: 10000000,
    color: '#00B0FF',
    secondaryColor: '#0091EA',
    rangeText: '70-79',
    iconFilename: 'level_70_to_79_bg.svga',
    badgeType: 'svga',
  },
  {
    levelNumber: 80,
    type: 'charm',
    name: 'Charm 80-89',
    minCoins: 10000000,
    maxCoins: 16000000,
    color: '#651FFF',
    secondaryColor: '#6200EA',
    rangeText: '80-89',
    iconFilename: 'level_80_to_89_bg.svga',
    badgeType: 'svga',
  },
  {
    levelNumber: 90,
    type: 'charm',
    name: 'Charm 90-99',
    minCoins: 16000000,
    maxCoins: 25000000,
    color: '#FF1744',
    secondaryColor: '#D50000',
    rangeText: '90-99',
    iconFilename: 'level_90_to_99_bg.svga',
    badgeType: 'svga',
  },
  {
    levelNumber: 100,
    type: 'charm',
    name: 'Charm 100',
    minCoins: 25000000,
    maxCoins: 50000000,
    color: '#FFD700',
    secondaryColor: '#FFA000',
    rangeText: '100',
    iconFilename: 'level_100_bg.svga',
    badgeType: 'svga',
  },
];

export async function seedLevels() {
  try {
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'levels');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // 1. Clean up invalid / legacy levels (e.g. leftover 2, 3, 4 that cause corrupt ranges in admin & app)
    const validRichNumbers = DEFAULT_LEVEL_DEFINITIONS.filter(d => d.type === 'rich').map(d => d.levelNumber);
    const validCharmNumbers = DEFAULT_LEVEL_DEFINITIONS.filter(d => d.type === 'charm').map(d => d.levelNumber);
    await Level.deleteMany({
      $or: [
        { type: 'rich', levelNumber: { $nin: validRichNumbers } },
        { type: 'charm', levelNumber: { $nin: validCharmNumbers } },
        { type: { $nin: ['rich', 'charm'] } },
      ],
    });

    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
    }

    const baseUrl = (process.env.APP_URL || process.env.BACKEND_URL || 'https://filiva-node.creatamax.in').replace(/\/$/, '');

    for (const lvl of DEFAULT_LEVEL_DEFINITIONS) {
      const filename = lvl.iconFilename;
      const filePath = path.join(uploadDir, filename);

      let secureUrl = `${baseUrl}/public/uploads/levels/${filename}`;
      const isSvga = filename.endsWith('.svga');
      const mimeType = isSvga ? 'application/svga' : (filename.endsWith('.png') ? 'image/png' : 'image/jpeg');

      // Check if file exists on disk
      const fileExists = fs.existsSync(filePath);

      // Attempt Cloudinary upload if configured and file exists on disk
      if (fileExists && process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        try {
          const uploadResult = await cloudinary.uploader.upload(filePath, {
            folder: 'levels',
            resource_type: isSvga ? 'raw' : 'image',
          });
          if (uploadResult?.secure_url) {
            secureUrl = uploadResult.secure_url;
          }
        } catch (uploadErr) {
          // Cloudinary fallback to baseUrl
        }
      }

      // Find or create Media record
      let media = await Media.findOne({ url: secureUrl });
      if (!media) {
        media = await Media.create({
          url: secureUrl,
          mimetype: mimeType,
          type: isSvga ? 'svga' : 'image',
        });
      } else if (media.mimetype !== mimeType || media.type !== (isSvga ? 'svga' : 'image')) {
        media.mimetype = mimeType;
        media.type = isSvga ? 'svga' : 'image';
        await media.save();
      }

      const levelData = {
        levelNumber: lvl.levelNumber,
        type: lvl.type,
        name: lvl.name,
        minCoins: lvl.minCoins,
        maxCoins: lvl.maxCoins,
        color: lvl.color,
        secondaryColor: lvl.secondaryColor,
        rangeText: lvl.rangeText,
        levelRange: lvl.rangeText,
        badgeType: lvl.badgeType || (isSvga ? 'svga' : 'image'),
        image: media._id,
      };

      await Level.findOneAndUpdate(
        { levelNumber: lvl.levelNumber, type: lvl.type },
        levelData,
        { upsert: true, new: true }
      );
    }

    AppLogger.info('✅ Rich and Charm Levels seeded successfully with real dynamic icons');
  } catch (error) {
    AppLogger.error('❌ Error seeding levels:', error);
  }
}
