import { Service } from 'typedi';
import Level from '../../models/Level';

function getLevelRangeText(levelNumber: number): string {
  if (levelNumber === 0) return '0';
  if (levelNumber >= 100) return '100';
  if (levelNumber >= 30) {
    const start = Math.floor(levelNumber / 10) * 10;
    return `${start}-${start + 9}`;
  }
  if (levelNumber >= 20) return '20-29';
  if (levelNumber >= 10) return '10-19';
  return '1-9';
}

@Service()
export class LevelService {
  private cache: { [key: string]: { data: any[]; expiresAt: number } } = {};

  public clearCache() {
    this.cache = {};
  }

  private async getCachedLevels(type: 'rich' | 'charm'): Promise<any[]> {
    const now = Date.now();
    if (this.cache[type] && this.cache[type].expiresAt > now) {
      return this.cache[type].data;
    }
    const levels = await Level.find({ type }).populate('image').sort({ levelNumber: 1 });
    this.cache[type] = {
      data: levels,
      expiresAt: now + 60000, // 60 seconds TTL
    };
    return levels;
  }

  public async getLevelInfoForCoins(coins: number, type: 'rich' | 'charm' = 'rich') {
    // Fetch levels sorted by levelNumber from cache
    const levels = await this.getCachedLevels(type);

    if (levels.length === 0) {
      const defaultColor = type === 'rich' ? '#CD7F32' : '#FFB6C1';
      return {
        currentLevel: {
          levelNumber: 0,
          type,
          name: `${type === 'rich' ? 'Rich' : 'Charm'} Level 0`,
          minCoins: 0,
          maxCoins: 5000,
          color: defaultColor,
          image: null,
          imageUrl: null,
          levelRange: '0',
          rangeText: '0',
        },
        nextLevel: null,
        progressPercentage: 0,
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

    // Find the next level in sequence
    const currentIndex = levels.findIndex(l => l.levelNumber === currentLevel!.levelNumber);
    const nextLevel = (currentIndex >= 0 && currentIndex < levels.length - 1) ? levels[currentIndex + 1] : null;

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
    currentObj.levelRange = getLevelRangeText(currentObj.levelNumber);
    currentObj.rangeText = getLevelRangeText(currentObj.levelNumber);
    currentObj.imageUrl = currentObj.image?.url || (typeof currentObj.image === 'string' ? currentObj.image : null);

    let nextObj = null;
    if (nextLevel) {
      nextObj = nextLevel.toObject ? nextLevel.toObject() : { ...nextLevel };
      nextObj.levelRange = getLevelRangeText(nextObj.levelNumber);
      nextObj.rangeText = getLevelRangeText(nextObj.levelNumber);
      nextObj.imageUrl = nextObj.image?.url || (typeof nextObj.image === 'string' ? nextObj.image : null);
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

    return levels.map(l => {
      const obj = l.toObject ? l.toObject() : { ...l };
      obj.levelRange = getLevelRangeText(obj.levelNumber);
      obj.rangeText = getLevelRangeText(obj.levelNumber);
      obj.imageUrl = obj.image?.url || (typeof obj.image === 'string' ? obj.image : null);
      return obj;
    });
  }
}
