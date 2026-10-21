import mongoose from 'mongoose';
import { Container } from 'typedi';
import Country from '../models/Country';
import User from '../models/User';
import { LevelService } from '../services/app/LevelService';

export function toPlainObject(doc: any) {
  if (!doc) return null;
  return doc.toObject ? doc.toObject() : doc;
}

export function formatLevelInfo(levelInfo: any) {
  if (!levelInfo) return null;
  const lvl = typeof levelInfo.currentLevel?.levelNumber === 'number' ? levelInfo.currentLevel.levelNumber : 0;
  return {
    ...levelInfo,
    level: lvl,
    levelNumber: lvl,
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
  if (!user) return null;
  const rawUser = (user as any) || {};

  const populated = rawUser.countryId as any;
  if (populated && typeof populated === 'object' && populated._id && (populated.name || populated.code || populated.flag)) {
    return formatCountryObject(populated);
  }

  if (rawUser.country && typeof rawUser.country === 'object' && (rawUser.country._id || rawUser.country.code || rawUser.country.name)) {
    return formatCountryObject(rawUser.country);
  }

  if (rawUser.countryId) {
    const countryId = typeof rawUser.countryId === 'object' ? rawUser.countryId._id || rawUser.countryId : rawUser.countryId;
    if (mongoose.Types.ObjectId.isValid(countryId)) {
      const country = await Country.findById(countryId);
      if (country) return formatCountryObject(country);
    }
  }

  const countrySignal = typeof rawUser.country === 'string' ? rawUser.country.trim() : '';
  if (countrySignal) {
    const pattern = new RegExp(`^${escapeRegex(countrySignal)}$`, 'i');
    const country = await Country.findOne({
      $or: [{ code: pattern }, { name: pattern }],
    });
    if (country) return formatCountryObject(country);
  }

  const nationalitySignal = typeof rawUser.nationality === 'string' ? rawUser.nationality.trim() : '';
  if (nationalitySignal) {
    const pattern = new RegExp(`^${escapeRegex(nationalitySignal)}$`, 'i');
    const country = await Country.findOne({
      $or: [{ code: pattern }, { name: pattern }],
    });
    if (country) return formatCountryObject(country);
  }

  const countryCodeSignal = typeof rawUser.countryCode === 'string' ? rawUser.countryCode.trim() : '';
  if (countryCodeSignal) {
    const pattern = new RegExp(`^${escapeRegex(countryCodeSignal)}$`, 'i');
    const country = await Country.findOne({
      $or: [{ code: pattern }, { name: pattern }],
    });
    if (country) return formatCountryObject(country);
  }

  if (countrySignal || nationalitySignal || countryCodeSignal) {
    const name = countrySignal || nationalitySignal || countryCodeSignal;
    const code = countryCodeSignal || (name.length === 2 ? name.toUpperCase() : null);
    return {
      _id: null,
      name,
      code,
      flag: rawUser.country_flag || null,
      phoneCode: null,
      countryCode: code,
      currencySymbol: null,
      currencyCode: null,
    };
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
): Promise<T & UserCountryAgeFields & { level: number; levelNumber: number; wealthLevel: number; charmLevel: number; richLevelInfo: any; charmLevelInfo: any; levelInfo: any }> {
  const payload = (user ?? {}) as any;
  if (!user) return payload;
  const rawUser = user as any;
  const country = await resolveCountryObject(user);
  payload.country = country;
  payload.countryId = country;
  payload.countryCode = country?.code ?? (typeof rawUser.countryCode === 'string' ? rawUser.countryCode : null);
  payload.country_flag = country?.flag ?? (typeof rawUser.country_flag === 'string' ? rawUser.country_flag : null);
  payload.age = ageFromDob(rawUser.dob);

  try {
    const levelService = Container.get(LevelService);
    const richCoins = rawUser.wealthCoins !== undefined ? rawUser.wealthCoins : (rawUser.coins || 0);
    const charmCoins = rawUser.charmCoins || 0;
    const [richLevelInfo, charmLevelInfo] = await Promise.all([
      levelService.getLevelInfoForCoins(richCoins, 'rich'),
      levelService.getLevelInfoForCoins(charmCoins, 'charm'),
    ]);
    const formattedRich = formatLevelInfo(richLevelInfo);
    const formattedCharm = formatLevelInfo(charmLevelInfo);
    const richLevelNum = typeof formattedRich?.level === 'number' ? formattedRich.level : 0;
    const charmLevelNum = typeof formattedCharm?.level === 'number' ? formattedCharm.level : 0;

    payload.level = richLevelNum;
    payload.levelNumber = richLevelNum;
    payload.wealthLevel = richLevelNum;
    payload.charmLevel = charmLevelNum;
    payload.richLevelInfo = formattedRich;
    payload.charmLevelInfo = formattedCharm;
    payload.levelInfo = formattedRich;
  } catch (err) {
    payload.level = payload.level ?? 0;
    payload.levelNumber = payload.levelNumber ?? 0;
    payload.wealthLevel = payload.wealthLevel ?? 0;
    payload.charmLevel = payload.charmLevel ?? 0;
  }

  return payload;
}

export async function getUserCountryAndLevels(
  user: InstanceType<typeof User> | Record<string, any>,
  levelService: LevelService
) {
  const rawUser = (user as any) || {};
  const richCoins = rawUser.wealthCoins !== undefined ? rawUser.wealthCoins : (rawUser.coins || 0);
  const charmCoins = rawUser.charmCoins || 0;
  const [country, richLevelInfo, charmLevelInfo] = await Promise.all([
    resolveCountryObject(rawUser),
    levelService.getLevelInfoForCoins(richCoins, 'rich'),
    levelService.getLevelInfoForCoins(charmCoins, 'charm'),
  ]);

  const levelInfo = formatLevelInfo(richLevelInfo);
  const charmLevel = formatLevelInfo(charmLevelInfo);

  const richLevelNum = typeof levelInfo?.level === 'number' ? levelInfo.level : 0;
  const charmLevelNum = typeof charmLevel?.level === 'number' ? charmLevel.level : 0;

  return {
    country,
    countryId: country?._id ?? rawUser.countryId ?? null,
    level: richLevelNum,
    levelNumber: richLevelNum,
    wealthLevel: richLevelNum,
    charmLevel: charmLevelNum,
    levelInfo,
    richLevelInfo: levelInfo,
    charmLevelInfo: charmLevel,
  };
}
