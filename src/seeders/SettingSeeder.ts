import AppSetting from '../models/AppSetting';
import AppLogger from '../api/loaders/logger';

export async function seedSettings() {
  try {
    const settings = [
      { key: 'family_creation_charge', value: 3000, description: 'Cost to create a family in coins' },
      { key: 'app_name', value: 'Filive', description: 'Application name' },
      {
        key: 'marital_statuses',
        value: ['single', 'divorced', 'married', 'secret', 'inlove'],
        description: 'List of available marital statuses'
      },
      {
        key: 'feedback_types',
        value: ['bug_report', 'feature_request', 'billing_issue', 'general_inquiry'],
        description: 'List of available help & feedback types'
      },
    ];

    for (const setting of settings) {
      await AppSetting.findOneAndUpdate(
        { key: setting.key },
        setting,
        { upsert: true, new: true }
      );
    }
    AppLogger.info('✅ App settings seeded');
  } catch (error) {
    AppLogger.error('❌ Error seeding app settings:', error);
  }
}
