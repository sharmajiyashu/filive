import { Service } from 'typedi';
import AppSetting from '../../models/AppSetting';

@Service()
export class AppSettingService {
  private defaultSettings = {
    coin_to_bean_rate: 1,
    min_coin_to_bean_transfer: 100,
    marital_statuses: ['single', 'divorced', 'married', 'secret', 'inlove'],
    agency_global_commission_rate: 10,
    agency_use_commission_slabs: true,
    agency_auto_settlement_enabled: true,
    agency_settlement_day: 1,
    call_platform_fee_percent: 10,
    invite_reward_coins: 2000,
    home_banner_image_url: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1200',
    party_room_banner_image_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200',
    recharge_offer_banner_image_url: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200',
    home_banners: ['https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1200'],
    party_room_banners: ['https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200'],
    recharge_offer_banners: ['https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200'],
  };

  async getSettings() {
    const settings = await AppSetting.find();
    const settingsMap = settings.reduce((acc: any, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});

    // Ensure defaults exist only when missing in database
    for (const [key, value] of Object.entries(this.defaultSettings)) {
      if (settingsMap[key] === undefined) {
        await AppSetting.create({ key, value });
        settingsMap[key] = value;
      }
    }

    return settingsMap;
  }

  async getSettingValue(key: string): Promise<any> {
    const setting = await AppSetting.findOne({ key });
    if (setting) return setting.value;

    const defaultValue = (this.defaultSettings as any)[key];
    if (defaultValue !== undefined) {
      await AppSetting.create({ key, value: defaultValue });
      return defaultValue;
    }
    return null;
  }

  async updateSettings(settings: { [key: string]: any }) {
    for (const [key, value] of Object.entries(settings)) {
      await AppSetting.findOneAndUpdate(
        { key },
        { value },
        { upsert: true, new: true }
      );
    }
    return this.getSettings();
  }
}
