import User, { IUser } from '../models/User';
import AppSetting from '../models/AppSetting';

export function generateReferralCode(user: any): string {
  if (user.userId) {
    return `REF${user.userId}`;
  }
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  return `REF${randomSuffix}`;
}

export async function ensureUserReferralCode(user: any): Promise<{ referralCode: string; referCode: string }> {
  if (user.referralCode || user.referCode) {
    const code = user.referralCode || user.referCode;
    if (!user.referralCode || !user.referCode) {
      await User.findByIdAndUpdate(user._id || user.id, { referralCode: code, referCode: code });
    }
    return { referralCode: code, referCode: code };
  }

  const code = generateReferralCode(user);
  await User.findByIdAndUpdate(user._id || user.id, { referralCode: code, referCode: code });
  user.referralCode = code;
  user.referCode = code;
  return { referralCode: code, referCode: code };
}

export async function getReferralDeepLink(referralCode: string): Promise<string> {
  const setting = await AppSetting.findOne({ key: 'deep_link_base_url' });
  const baseUrl = setting?.value || 'https://filive.app/invite';
  const cleanBaseUrl = String(baseUrl).trim();
  const separator = cleanBaseUrl.includes('?') ? '&' : '?';
  return `${cleanBaseUrl}${separator}referralCode=${referralCode}`;
}
