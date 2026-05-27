import { Service } from 'typedi';
import AppSetting from '../../models/AppSetting';

@Service()
export class AppSettingService {
  private defaultSettings = {
    coin_to_bean_rate: 1,
    min_coin_to_bean_transfer: 100,
    marital_statuses: ['single', 'divorced', 'married', 'secret', 'inlove']
  };

  async getSettings() {
    const settings = await AppSetting.find();
    const settingsMap = settings.reduce((acc: any, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});

    // Ensure defaults exist
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
