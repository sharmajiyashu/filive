import Career from '../models/Career';
import Media from '../models/Media';
import AppLogger from '../api/loaders/logger';

export async function seedCareers() {
  try {
    const careersData = [
      { name: 'Engineer', url: 'https://res.cloudinary.com/demo/image/upload/v1631234567/careers/engineer.png' },
      { name: 'Doctor', url: 'https://res.cloudinary.com/demo/image/upload/v1631234567/careers/doctor.png' },
      { name: 'Artist', url: 'https://res.cloudinary.com/demo/image/upload/v1631234567/careers/artist.png' },
      { name: 'Teacher', url: 'https://res.cloudinary.com/demo/image/upload/v1631234567/careers/teacher.png' },
      { name: 'Student', url: 'https://res.cloudinary.com/demo/image/upload/v1631234567/careers/student.png' },
      { name: 'Creative', url: 'https://res.cloudinary.com/demo/image/upload/v1631234567/careers/creative.png' },
      { name: 'Developer', url: 'https://res.cloudinary.com/demo/image/upload/v1631234567/careers/developer.png' },
    ];

    for (const data of careersData) {
      let media = await Media.findOne({ url: data.url });
      if (!media) {
        media = await Media.create({
          url: data.url,
          mimetype: 'image/png',
          type: 'image'
        });
      }

      await Career.findOneAndUpdate(
        { name: data.name },
        { name: data.name, image: media._id, isActive: true },
        { upsert: true, new: true }
      );
    }
    AppLogger.info('✅ Careers seeded');
  } catch (error) {
    AppLogger.error('❌ Error seeding careers:', error);
  }
}
