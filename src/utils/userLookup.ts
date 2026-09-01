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
    level: typeof levelInfo.currentLevel?.levelNumber === 'number' ? levelInfo.currentLevel.levelNumber : 1,
  };
}

export function formatCountryObject(country: any) {
  const obj = toPlainObject(country);
  if (!obj) return null;
  return {
    _id: obj._id,
    name: obj.name,
    code: obj.code,
    flag: obj.flag,
    phoneCode: obj.phoneCode ?? obj.countryCode ?? null,
    countryCode: obj.countryCode ?? obj.phoneCode ?? null,
    currencySymbol: obj.currencySymbol ?? null,
    currencyCode: obj.currencyCode ?? null,
  };
}

export function ageFromDob(dob?: Date | string | null): number | null {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function resolveCountryObject(user: InstanceType<typeof User> | Record<string, any>) {
  const populated = user.countryId as any;
  if (populated && typeof populated === 'object' && populated._id && (populated.name || populated.code || populated.flag)) {
    return formatCountryObject(populated);
  }

  if (user.country && typeof user.country === 'object' && (user.country._id || user.country.code || user.country.name)) {
    return formatCountryObject(user.country);
  }

  if (user.countryId) {
    const countryId = typeof user.countryId === 'object' ? user.countryId._id || user.countryId : user.countryId;
    const country = await Country.findById(countryId);
    if (country) return formatCountryObject(country);
  }

  const countrySignal = typeof user.country === 'string' ? user.country.trim() : '';
  if (countrySignal) {
    const pattern = new RegExp(`^${escapeRegex(countrySignal)}$`, 'i');
    const country = await Country.findOne({
      $or: [{ code: pattern }, { name: pattern }],
    });
    if (country) return formatCountryObject(country);
  }

  return null;
}

export type UserCountryAgeFields = {
  country: ReturnType<typeof formatCountryObject>;
  countryId: ReturnType<typeof formatCountryObject>;
  countryCode: string | null;
  country_flag: string | null;
  age: number | null;
};

export async function attachUserCountryAndAge<T extends Record<string, any>>(
  user: T
): Promise<T & UserCountryAgeFields> {
  const payload = (user ?? {}) as T & UserCountryAgeFields;
  if (!user) return payload;
  const country = await resolveCountryObject(user);
  payload.country = country;
  payload.countryId = country;
  payload.countryCode = country?.code ?? null;
  payload.country_flag = country?.flag ?? null;
  payload.age = ageFromDob(user.dob);
  return payload;
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
