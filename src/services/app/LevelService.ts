import { Service } from 'typedi';
import Level from '../../models/Level';
import { DEFAULT_LEVEL_DEFINITIONS } from '../../seeders/LevelSeeder';

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

export function formatLevelImageUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const appUrl = (process.env.APP_URL || process.env.BACKEND_URL || 'https://filiva-node.creatamax.in').replace(/\/$/, '');
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${appUrl}${cleanPath}`;
}

function getDefaultLevels(type: 'rich' | 'charm') {
  const matchingDefs = DEFAULT_LEVEL_DEFINITIONS.filter(d => d.type === type);
  return matchingDefs.map(def => ({
    _id: `default_${type}_${def.levelNumber}`,
    type,
    levelNumber: def.levelNumber,
    name: def.name,
    minCoins: def.minCoins,
    maxCoins: def.maxCoins,
    color: def.color,
    secondaryColor: def.secondaryColor,
    image: null,
    imageUrl: formatLevelImageUrl(`/public/uploads/levels/${def.iconFilename}`),
    levelRange: def.rangeText,
    rangeText: def.rangeText,
    badgeType: def.badgeType || (def.iconFilename.endsWith('.svga') ? 'svga' : 'image'),
  }));
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
    let levels = await Level.find({ type }).populate('image').sort({ levelNumber: 1 });
    if (!levels || levels.length === 0) {
      levels = getDefaultLevels(type) as any;
    }
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
          name: `${type === 'rich' ? 'Wealth' : 'Charm'} 0`,
          minCoins: 0,
          maxCoins: 0,
          color: defaultColor,
          secondaryColor: defaultColor,
          image: null,
          imageUrl: null,
          levelRange: '0',
          rangeText: '0',
          badgeType: 'image',
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
    currentObj.levelRange = currentObj.rangeText || currentObj.levelRange || getLevelRangeText(currentObj.levelNumber);
    currentObj.rangeText = currentObj.rangeText || getLevelRangeText(currentObj.levelNumber);
    const rawCurrentUrl = currentObj.image?.url || (typeof currentObj.image === 'string' ? currentObj.image : currentObj.imageUrl);
    currentObj.imageUrl = formatLevelImageUrl(rawCurrentUrl);
    currentObj.badgeType = currentObj.badgeType || (currentObj.imageUrl?.endsWith('.svga') ? 'svga' : 'image');

    let nextObj = null;
    if (nextLevel) {
      nextObj = nextLevel.toObject ? nextLevel.toObject() : { ...nextLevel };
      nextObj.levelRange = nextObj.rangeText || nextObj.levelRange || getLevelRangeText(nextObj.levelNumber);
      nextObj.rangeText = nextObj.rangeText || getLevelRangeText(nextObj.levelNumber);
      const rawNextUrl = nextObj.image?.url || (typeof nextObj.image === 'string' ? nextObj.image : nextObj.imageUrl);
      nextObj.imageUrl = formatLevelImageUrl(rawNextUrl);
      nextObj.badgeType = nextObj.badgeType || (nextObj.imageUrl?.endsWith('.svga') ? 'svga' : 'image');
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
    let levels = await Level.find(query).populate('image').sort({ type: 1, levelNumber: 1 });
    if (!levels || levels.length === 0) {
      if (type) {
        return getDefaultLevels(type);
      }
      return [...getDefaultLevels('rich'), ...getDefaultLevels('charm')];
    }

    return levels.map(l => {
      const obj = l.toObject ? l.toObject() : { ...l };
      obj.levelRange = obj.rangeText || obj.levelRange || getLevelRangeText(obj.levelNumber);
      obj.rangeText = obj.rangeText || getLevelRangeText(obj.levelNumber);
      const rawUrl = obj.image?.url || (typeof obj.image === 'string' ? obj.image : obj.imageUrl);
      obj.imageUrl = formatLevelImageUrl(rawUrl);
      obj.badgeType = obj.badgeType || (obj.imageUrl?.endsWith('.svga') ? 'svga' : 'image');
      return obj;
    });
  }
}
