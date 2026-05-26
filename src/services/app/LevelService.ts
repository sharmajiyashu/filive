import { Service } from 'typedi';
import Level from '../../models/Level';
import Media from '../../models/Media';
import config from '../../config';
import mongoose from 'mongoose';

function getFullImageUrl(imagePathOrMedia?: any): string {
  if (!imagePathOrMedia) return '';
  let imagePath = '';
  if (typeof imagePathOrMedia === 'object' && imagePathOrMedia.url) {
    imagePath = imagePathOrMedia.url;
  } else if (typeof imagePathOrMedia === 'string') {
    imagePath = imagePathOrMedia;
  } else if (imagePathOrMedia.toString) {
    imagePath = imagePathOrMedia.toString();
  } else {
    return '';
  }
  if (imagePath.length === 24 && /^[0-9a-fA-F]{24}$/.test(imagePath)) {
    return '';
  }
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  const baseUrl = config.backend.url || process.env.APP_URL || 'http://localhost:3000';
  return `${baseUrl.replace(/\/$/, '')}/${imagePath.replace(/^\//, '')}`;
}

async function resolveLevelImage(imageField: any): Promise<any> {
  if (!imageField) return null;

  let mediaDoc: any = null;

  if (typeof imageField === 'object' && imageField.url) {
    mediaDoc = imageField.toObject ? imageField.toObject() : { ...imageField };
  } else if (mongoose.Types.ObjectId.isValid(imageField)) {
    const doc = await Media.findById(imageField);
    if (doc) {
      mediaDoc = doc.toObject();
    }
  }

  if (mediaDoc) {
    mediaDoc.url = getFullImageUrl(mediaDoc.url);
    return mediaDoc;
  }

  if (typeof imageField === 'string' && !mongoose.Types.ObjectId.isValid(imageField)) {
    return {
      url: getFullImageUrl(imageField),
      mimetype: imageField.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg',
      type: 'image'
    };
  }

  return null;
}

function getLevelRangeText(levelNumber: number): string {
  if (levelNumber === 0) return '0';
  const groupStart = Math.floor((levelNumber - 1) / 5) * 5 + 1;
  const groupEnd = groupStart + 4;
  return `${groupStart}-${groupEnd}`;
}

@Service()
export class LevelService {
  public async getLevelInfoForCoins(coins: number, type: 'rich' | 'charm' = 'rich') {
    // Fetch levels sorted by levelNumber
    const levels = await Level.find({ type }).populate('image').sort({ levelNumber: 1 });

    if (levels.length === 0) {
      // Fallback in case levels are not yet seeded
      const fallbackRange = 5000;
      const progress = Math.min(100, Math.max(0, (coins / fallbackRange) * 100));
      return {
        currentLevel: {
          levelNumber: 0,
          type,
          name: type === 'rich' ? 'Rich Level 0' : 'Charm Level 0',
          minCoins: 0,
          maxCoins: 5000,
          color: type === 'rich' ? '#CD7F32' : '#FFB6C1',
          image: getFullImageUrl(`/public/uploads/levels/${type}_level_0.svg`),
          levelRange: '0',
          rangeText: '0'
        },
        nextLevel: {
          levelNumber: 1,
          type,
          name: type === 'rich' ? 'Rich Level 1' : 'Charm Level 1',
          minCoins: 5000,
          maxCoins: 20000,
          color: type === 'rich' ? '#C0C0C0' : '#FF69B4',
          image: getFullImageUrl(`/public/uploads/levels/${type}_level_1.svg`),
          levelRange: '1-5',
          rangeText: '1-5'
        },
        progressPercentage: Number(progress.toFixed(2)),
      };
    }

    // Find current level based on coin count
    let currentLevel = levels.find(l => coins >= l.minCoins && coins <= l.maxCoins);

    // If coins exceed the max of the highest level, cap at the highest level
    if (!currentLevel && coins > levels[levels.length - 1].maxCoins) {
      currentLevel = levels[levels.length - 1];
    }

    if (!currentLevel) {
      currentLevel = levels[0];
    }

    // Find the next level if it exists
    const nextLevel = levels.find(l => l.levelNumber === currentLevel!.levelNumber + 1) || null;

    let progressPercentage = 0;
    if (nextLevel) {
      const range = currentLevel.maxCoins - currentLevel.minCoins;
      if (range > 0) {
        progressPercentage = ((coins - currentLevel.minCoins) / range) * 100;
      } else {
        progressPercentage = 100;
      }
    } else {
      progressPercentage = 100;
    }

    // Ensure it's bounded between 0 and 100 and clean to 2 decimal places
    progressPercentage = Math.min(100, Math.max(0, Number(progressPercentage.toFixed(2))));

    const currentObj = currentLevel.toObject ? currentLevel.toObject() : { ...currentLevel };
    currentObj.image = await resolveLevelImage(currentObj.image);
    currentObj.levelRange = getLevelRangeText(currentObj.levelNumber);
    currentObj.rangeText = getLevelRangeText(currentObj.levelNumber);

    let nextObj = null;
    if (nextLevel) {
      nextObj = nextLevel.toObject ? nextLevel.toObject() : { ...nextLevel };
      nextObj.image = await resolveLevelImage(nextObj.image);
      nextObj.levelRange = getLevelRangeText(nextObj.levelNumber);
      nextObj.rangeText = getLevelRangeText(nextObj.levelNumber);
    }

    return {
      currentLevel: currentObj,
      nextLevel: nextObj,
      progressPercentage,
    };
  }

  public async getAllLevels(type?: 'rich' | 'charm') {
    const query: any = {};
    if (type) {
      query.type = type;
    }
    const levels = await Level.find(query).populate('image').sort({ type: 1, levelNumber: 1 });

    if (levels.length === 0) {
      const fallbackLevels = [
        { levelNumber: 0, type: 'rich', name: 'Rich Level 0', minCoins: 0, maxCoins: 5000, color: '#CD7F32', image: '/public/uploads/levels/rich_level_0.svg' },
        { levelNumber: 1, type: 'rich', name: 'Rich Level 1', minCoins: 5000, maxCoins: 20000, color: '#C0C0C0', image: '/public/uploads/levels/rich_level_1.svg' },
        { levelNumber: 2, type: 'rich', name: 'Rich Level 2', minCoins: 20000, maxCoins: 40000, color: '#FFD700', image: '/public/uploads/levels/rich_level_2.svg' },
        { levelNumber: 3, type: 'rich', name: 'Rich Level 3', minCoins: 40000, maxCoins: 60000, color: '#E5E4E2', image: '/public/uploads/levels/rich_level_3.svg' },
        { levelNumber: 4, type: 'rich', name: 'Rich Level 4', minCoins: 60000, maxCoins: 82200, color: '#0F52BA', image: '/public/uploads/levels/rich_level_4.svg' },

        { levelNumber: 0, type: 'charm', name: 'Charm Level 0', minCoins: 0, maxCoins: 5000, color: '#FFB6C1', image: '/public/uploads/levels/charm_level_0.svg' },
        { levelNumber: 1, type: 'charm', name: 'Charm Level 1', minCoins: 5000, maxCoins: 20000, color: '#FF69B4', image: '/public/uploads/levels/charm_level_1.svg' },
        { levelNumber: 2, type: 'charm', name: 'Charm Level 2', minCoins: 20000, maxCoins: 40000, color: '#FF1493', image: '/public/uploads/levels/charm_level_2.svg' },
        { levelNumber: 3, type: 'charm', name: 'Charm Level 3', minCoins: 40000, maxCoins: 60000, color: '#DB7093', image: '/public/uploads/levels/charm_level_3.svg' },
        { levelNumber: 4, type: 'charm', name: 'Charm Level 4', minCoins: 60000, maxCoins: 82200, color: '#C71585', image: '/public/uploads/levels/charm_level_4.svg' }
      ];

      const filtered = type ? fallbackLevels.filter(l => l.type === type) : fallbackLevels;
      return filtered.map(l => ({
        ...l,
        image: getFullImageUrl(l.image),
        levelRange: getLevelRangeText(l.levelNumber),
        rangeText: getLevelRangeText(l.levelNumber)
      }));
    }

    return Promise.all(levels.map(async l => {
      const obj = l.toObject ? l.toObject() : { ...l };
      obj.image = await resolveLevelImage(obj.image);
      obj.levelRange = getLevelRangeText(obj.levelNumber);
      obj.rangeText = getLevelRangeText(obj.levelNumber);
      return obj;
    }));
  }
}
