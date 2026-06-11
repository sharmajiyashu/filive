import Country from '../models/Country';
import User from '../models/User';
import { LevelService } from '../services/app/LevelService';

export function toPlainObject(doc: any) {
  if (!doc) return null;
  return doc.toObject ? doc.toObject() : doc;
}

export function formatLevelInfo(levelInfo: any) {
  if (!levelInfo) return null;
  return {
    ...levelInfo,
    level: levelInfo.currentLevel ?? null,
  };
}

export async function resolveCountryObject(user: InstanceType<typeof User>) {
  const populated = user.countryId as any;
  if (populated && typeof populated === 'object' && populated._id) {
    return toPlainObject(populated);
  }

  if (user.countryId) {
    const country = await Country.findById(user.countryId);
    if (country) return toPlainObject(country);
  }

  if (user.country) {
    const country = await Country.findOne({
      name: { $regex: new RegExp(`^${String(user.country).trim()}$`, 'i') },
    });
    if (country) return toPlainObject(country);
  }

  return null;
}

export async function getUserCountryAndLevels(
  user: InstanceType<typeof User>,
  levelService: LevelService
) {
  const richCoins = user.wealthCoins !== undefined ? user.wealthCoins : (user.coins || 0);
  const charmCoins = user.charmCoins || 0;
  const [country, richLevelInfo, charmLevelInfo] = await Promise.all([
    resolveCountryObject(user),
    levelService.getLevelInfoForCoins(richCoins, 'rich'),
    levelService.getLevelInfoForCoins(charmCoins, 'charm'),
  ]);

  const levelInfo = formatLevelInfo(richLevelInfo);
  const charmLevel = formatLevelInfo(charmLevelInfo);

  return {
    country,
    countryId: country?._id ?? user.countryId ?? null,
    level: levelInfo?.level ?? null,
    levelInfo,
    richLevelInfo: levelInfo,
    charmLevelInfo: charmLevel,
    charmLevel: charmLevel?.level ?? null,
  };
}
