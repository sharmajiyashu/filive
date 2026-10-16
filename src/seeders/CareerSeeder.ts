import Career from '../models/Career';
import Media from '../models/Media';
import AppLogger from '../api/loaders/logger';

export async function seedCareers() {
  try {
    const careersData = [
      { name: 'Software Engineer', url: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=500&auto=format&fit=crop' },
      { name: 'Doctor', url: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=500&auto=format&fit=crop' },
      { name: 'Designer', url: 'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=500&auto=format&fit=crop' },
      { name: 'Artist & Painter', url: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=500&auto=format&fit=crop' },
      { name: 'Teacher & Professor', url: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=500&auto=format&fit=crop' },
      { name: 'Student', url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=500&auto=format&fit=crop' },
      { name: 'Content Creator', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop' },
      { name: 'Musician & Singer', url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop' },
      { name: 'Model', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop' },
      { name: 'Chef & Culinary', url: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?w=500&auto=format&fit=crop' },
      { name: 'Fitness Trainer', url: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=500&auto=format&fit=crop' },
      { name: 'Photographer', url: 'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=500&auto=format&fit=crop' },
      { name: 'Entrepreneur', url: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=500&auto=format&fit=crop' },
      { name: 'Pilot', url: 'https://images.unsplash.com/photo-1519074069444-1ba4ea16e729?w=500&auto=format&fit=crop' },
      { name: 'Lawyer & Advocate', url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=500&auto=format&fit=crop' },
      { name: 'Finance & Banker', url: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=500&auto=format&fit=crop' },
      { name: 'Marketing & PR', url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=500&auto=format&fit=crop' },
      { name: 'Writer & Journalist', url: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=500&auto=format&fit=crop' },
      { name: 'Architect', url: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=500&auto=format&fit=crop' },
      { name: 'Actor & Performer', url: 'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=500&auto=format&fit=crop' },
      { name: 'Engineer', url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500&auto=format&fit=crop' },
      { name: 'Developer', url: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=500&auto=format&fit=crop' },
    ];

    for (const data of careersData) {
      let media = await Media.findOne({ url: data.url });
      if (!media) {
        media = await Media.create({
          url: data.url,
          mimetype: 'image/jpeg',
          type: 'image'
        });
      }

      await Career.findOneAndUpdate(
        { name: data.name },
        { name: data.name, image: media._id, isActive: true },
        { upsert: true, new: true }
      );
    }
    AppLogger.info(`✅ Seeded ${careersData.length} careers successfully`);
  } catch (error) {
    AppLogger.error('❌ Error seeding careers:', error);
  }
}

