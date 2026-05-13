import AppSetting from '../models/AppSetting';
import AppLogger from '../api/loaders/logger';

export async function seedSettings() {
  try {
    const settings = [
      { key: 'family_creation_charge', value: 3000, description: 'Cost to create a family in coins' },
      { key: 'app_name', value: 'Filive', description: 'Application name' },
      {
        key: 'careers',
        value: [
          { name: 'Engineer', image: 'https://res.cloudinary.com/demo/image/upload/v1631234567/careers/engineer.png' },
          { name: 'Doctor', image: 'https://res.cloudinary.com/demo/image/upload/v1631234567/careers/doctor.png' },
          { name: 'Artist', image: 'https://res.cloudinary.com/demo/image/upload/v1631234567/careers/artist.png' },
          { name: 'Teacher', image: 'https://res.cloudinary.com/demo/image/upload/v1631234567/careers/teacher.png' },
          { name: 'Student', image: 'https://res.cloudinary.com/demo/image/upload/v1631234567/careers/student.png' },
        ],
        description: 'List of available careers with images'
      },
      {
        key: 'marital_statuses',
        value: ['single', 'divorced', 'married', 'secret', 'inlove'],
        description: 'List of available marital statuses'
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
