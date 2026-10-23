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

const DEFAULT_LEVEL_TIERS = [
  { levelNumber: 1, minCoins: 0, maxCoins: 20000, color: '#FF4B8A', rangeText: '1-9', levelRange: '1-9' },
  { levelNumber: 10, minCoins: 20000, maxCoins: 100000, color: '#6A85F1', rangeText: '10-19', levelRange: '10-19' },
  { levelNumber: 20, minCoins: 100000, maxCoins: 300000, color: '#FFD700', rangeText: '20-29', levelRange: '20-29' },
  { levelNumber: 30, minCoins: 300000, maxCoins: 700000, color: '#7C6FCD', rangeText: '30-39', levelRange: '30-39' },
  { levelNumber: 40, minCoins: 700000, maxCoins: 1500000, color: '#E040FB', rangeText: '40-49', levelRange: '40-49' },
  { levelNumber: 50, minCoins: 1500000, maxCoins: 3000000, color: '#FF5722', rangeText: '50-59', levelRange: '50-59' },
  { levelNumber: 60, minCoins: 3000000, maxCoins: 6000000, color: '#00E676', rangeText: '60-69', levelRange: '60-69' },
  { levelNumber: 70, minCoins: 6000000, maxCoins: 10000000, color: '#00B0FF', rangeText: '70-79', levelRange: '70-79' },
  { levelNumber: 80, minCoins: 10000000, maxCoins: 16000000, color: '#651FFF', rangeText: '80-89', levelRange: '80-89' },
  { levelNumber: 90, minCoins: 16000000, maxCoins: 25000000, color: '#FF1744', rangeText: '90-99', levelRange: '90-99' },
  { levelNumber: 100, minCoins: 25000000, maxCoins: 50000000, color: '#FFD700', rangeText: '100', levelRange: '100' },
];

function getDefaultLevels(type: 'rich' | 'charm') {
  return DEFAULT_LEVEL_TIERS.map(tier => ({
    _id: `default_${type}_${tier.levelNumber}`,
    type,
    levelNumber: tier.levelNumber,
    name: `${type === 'rich' ? 'Wealth' : 'Charm'} ${tier.rangeText}`,
    minCoins: tier.minCoins,
    maxCoins: tier.maxCoins,
    color: tier.color,
    image: null,
    imageUrl: null,
    levelRange: tier.levelRange,
    rangeText: tier.rangeText,
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
    let levels = await Level.find(query).populate('image').sort({ type: 1, levelNumber: 1 });
    if (!levels || levels.length === 0) {
      if (type) {
        return getDefaultLevels(type);
      }
      return [...getDefaultLevels('rich'), ...getDefaultLevels('charm')];
    }

    return levels.map(l => {
      const obj = l.toObject ? l.toObject() : { ...l };
      obj.levelRange = getLevelRangeText(obj.levelNumber);
      obj.rangeText = getLevelRangeText(obj.levelNumber);
      obj.imageUrl = obj.image?.url || (typeof obj.image === 'string' ? obj.image : null);
      return obj;
    });
  }
}
