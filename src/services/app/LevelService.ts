import { Service } from 'typedi';
import Level from '../../models/Level';

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
      return {
        currentLevel: null,
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
    currentObj.levelRange = getLevelRangeText(currentObj.levelNumber);
    currentObj.rangeText = getLevelRangeText(currentObj.levelNumber);

    let nextObj = null;
    if (nextLevel) {
      nextObj = nextLevel.toObject ? nextLevel.toObject() : { ...nextLevel };
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

    return levels.map(l => {
      const obj = l.toObject ? l.toObject() : { ...l };
      obj.levelRange = getLevelRangeText(obj.levelNumber);
      obj.rangeText = getLevelRangeText(obj.levelNumber);
      return obj;
    });
  }
}
