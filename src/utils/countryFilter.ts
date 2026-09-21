import mongoose from 'mongoose';
import Country from '../models/Country';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isAllCountries(country?: string | null): boolean {
  if (!country) return true;
  const value = country.trim().toLowerCase();
  return value === '' || value === 'all' || value === 'all countries' || value === 'null' || value === 'undefined';
}

export async function resolveCountryUserFilter(country?: string | null): Promise<Record<string, any> | null> {
  if (isAllCountries(country)) {
    return null;
  }

  const targetCountry = country!.trim();
  const escapedTarget = escapeRegex(targetCountry);
  const countryConditions: any[] = [];
  if (mongoose.Types.ObjectId.isValid(targetCountry)) {
    countryConditions.push({ _id: new mongoose.Types.ObjectId(targetCountry) });
  }
  countryConditions.push({ name: { $regex: new RegExp(`^${escapedTarget}$`, 'i') } });
  countryConditions.push({ code: { $regex: new RegExp(`^${escapedTarget}$`, 'i') } });
  countryConditions.push({ name: { $regex: escapedTarget, $options: 'i' } });

  const numericVal = Number(targetCountry.replace(/^\+/, ''));
  if (!isNaN(numericVal) && numericVal > 0) {
    countryConditions.push({ phoneCode: numericVal });
    countryConditions.push({ countryCode: numericVal });
  }

  const matchingCountries = await Country.find({ $or: countryConditions });
  const countryObjIds = matchingCountries.map((c) => c._id);
  const countryNames = matchingCountries.map((c) => c.name);
  const countryCodes = matchingCountries.map((c) => c.code);

  const userQueryConditions: any[] = [];
  if (countryObjIds.length > 0) {
    userQueryConditions.push({ countryId: { $in: countryObjIds } });
  }
  if (mongoose.Types.ObjectId.isValid(targetCountry)) {
    userQueryConditions.push({ countryId: new mongoose.Types.ObjectId(targetCountry) });
  }
  userQueryConditions.push({ country: { $regex: new RegExp(`^${escapedTarget}$`, 'i') } });
  userQueryConditions.push({ country: { $regex: escapedTarget, $options: 'i' } });
  userQueryConditions.push({ nationality: { $regex: new RegExp(`^${escapedTarget}$`, 'i') } });
  userQueryConditions.push({ nationality: { $regex: escapedTarget, $options: 'i' } });

  if (countryNames.length > 0) {
    userQueryConditions.push({ country: { $in: countryNames } });
    userQueryConditions.push({ nationality: { $in: countryNames } });
  }
  if (countryCodes.length > 0) {
    userQueryConditions.push({ country: { $in: countryCodes } });
    userQueryConditions.push({ nationality: { $in: countryCodes } });
  }

  if (!isNaN(numericVal) && numericVal > 0) {
    userQueryConditions.push({ mobile: { $regex: new RegExp(`^\\+?${numericVal}`) } });
  }

  if (userQueryConditions.length === 0) {
    return { _id: { $in: [] } };
  }

  return { $or: userQueryConditions };
}

export async function resolveCountryUserIds(country?: string | null): Promise<mongoose.Types.ObjectId[] | null> {
  const filter = await resolveCountryUserFilter(country);
  if (!filter) return null;

  const User = mongoose.model('User');
  const users = await User.find({ userRole: 'user', ...filter }).select('_id');
  return users.map((u: any) => u._id);
}
