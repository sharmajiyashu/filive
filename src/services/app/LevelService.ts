import { Service } from 'typedi';
import Level from '../../models/Level';
import config from '../../config';

function getFullImageUrl(imagePath?: string): string {
  if (!imagePath) return '';
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  const baseUrl = config.backend.url || 'http://localhost:3000';
  return `${baseUrl.replace(/\/$/, '')}/${imagePath.replace(/^\//, '')}`;
}

@Service()
export class LevelService {
  public async getLevelInfoForCoins(coins: number) {
    // Fetch levels sorted by levelNumber
    const levels = await Level.find().sort({ levelNumber: 1 });

    if (levels.length === 0) {
      // Fallback in case levels are not yet seeded
      const fallbackRange = 5000;
      const progress = Math.min(100, Math.max(0, (coins / fallbackRange) * 100));
      return {
        currentLevel: {
          levelNumber: 1,
          name: 'Bronze Level',
          minCoins: 0,
          maxCoins: 5000,
          color: '#CD7F32',
          image: getFullImageUrl('/public/uploads/levels/level_1.svg'),
        },
        nextLevel: {
          levelNumber: 2,
          name: 'Silver Level',
          minCoins: 5000,
          maxCoins: 10000,
          color: '#C0C0C0',
          image: getFullImageUrl('/public/uploads/levels/level_2.svg'),
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
    currentObj.image = getFullImageUrl(currentObj.image);

    let nextObj = null;
    if (nextLevel) {
      nextObj = nextLevel.toObject ? nextLevel.toObject() : { ...nextLevel };
      nextObj.image = getFullImageUrl(nextObj.image);
    }

    return {
      currentLevel: currentObj,
      nextLevel: nextObj,
      progressPercentage,
    };
  }

  public async getAllLevels() {
    const levels = await Level.find().sort({ levelNumber: 1 });

    if (levels.length === 0) {
      const fallbackLevels = [
        { levelNumber: 1, name: 'Bronze Level', minCoins: 0, maxCoins: 5000, color: '#CD7F32', image: '/public/uploads/levels/level_1.svg' },
        { levelNumber: 2, name: 'Silver Level', minCoins: 5000, maxCoins: 10000, color: '#C0C0C0', image: '/public/uploads/levels/level_2.svg' },
        { levelNumber: 3, name: 'Gold Level', minCoins: 10000, maxCoins: 20000, color: '#FFD700', image: '/public/uploads/levels/level_3.svg' },
        { levelNumber: 4, name: 'Platinum Level', minCoins: 20000, maxCoins: 50000, color: '#E5E4E2', image: '/public/uploads/levels/level_4.svg' },
        { levelNumber: 5, name: 'Sapphire Level', minCoins: 50000, maxCoins: 100000, color: '#0F52BA', image: '/public/uploads/levels/level_5.svg' },
        { levelNumber: 6, name: 'Emerald Level', minCoins: 100000, maxCoins: 200000, color: '#50C878', image: '/public/uploads/levels/level_6.svg' },
        { levelNumber: 7, name: 'Ruby Level', minCoins: 200000, maxCoins: 500000, color: '#E0115F', image: '/public/uploads/levels/level_7.svg' },
        { levelNumber: 8, name: 'Diamond Level', minCoins: 500000, maxCoins: 1000000, color: '#B9F2FF', image: '/public/uploads/levels/level_8.svg' },
        { levelNumber: 9, name: 'Amethyst Level', minCoins: 1000000, maxCoins: 2000000, color: '#E6E6FA', image: '/public/uploads/levels/level_9.svg' },
        { levelNumber: 10, name: 'Obsidian Level', minCoins: 2000000, maxCoins: 10000000, color: '#00FFFF', image: '/public/uploads/levels/level_10.svg' }
      ];
      return fallbackLevels.map(l => ({
        ...l,
        image: getFullImageUrl(l.image)
      }));
    }

    return levels.map(l => {
      const obj = l.toObject ? l.toObject() : { ...l };
      obj.image = getFullImageUrl(obj.image);
      return obj;
    });
  }
}

