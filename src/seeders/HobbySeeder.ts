import Hobby from '../models/Hobby';
import Media from '../models/Media';
import AppLogger from '../api/loaders/logger';

export async function seedHobbies() {
  try {
    const hobbiesData = [
      // Sports Hobbies
      {
        name: 'Football',
        type: 'sports' as const,
        url: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=500&auto=format&fit=crop'
      },
      {
        name: 'Basketball',
        type: 'sports' as const,
        url: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=500&auto=format&fit=crop'
      },
      {
        name: 'Cricket',
        type: 'sports' as const,
        url: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=500&auto=format&fit=crop'
      },
      {
        name: 'Tennis',
        type: 'sports' as const,
        url: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=500&auto=format&fit=crop'
      },
      {
        name: 'Badminton',
        type: 'sports' as const,
        url: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=500&auto=format&fit=crop'
      },
      {
        name: 'Swimming',
        type: 'sports' as const,
        url: 'https://images.unsplash.com/photo-1519315901367-f34ff9154487?w=500&auto=format&fit=crop'
      },
      {
        name: 'Gym & Fitness',
        type: 'sports' as const,
        url: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=500&auto=format&fit=crop'
      },
      {
        name: 'Yoga & Meditation',
        type: 'sports' as const,
        url: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=500&auto=format&fit=crop'
      },
      {
        name: 'Running & Jogging',
        type: 'sports' as const,
        url: 'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=500&auto=format&fit=crop'
      },
      {
        name: 'Cycling',
        type: 'sports' as const,
        url: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=500&auto=format&fit=crop'
      },
      {
        name: 'Boxing & MMA',
        type: 'sports' as const,
        url: 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=500&auto=format&fit=crop'
      },
      {
        name: 'Dancing',
        type: 'sports' as const,
        url: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop'
      },
      {
        name: 'Volleyball',
        type: 'sports' as const,
        url: 'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=500&auto=format&fit=crop'
      },
      {
        name: 'Table Tennis',
        type: 'sports' as const,
        url: 'https://images.unsplash.com/photo-1534158914592-062992fbe900?w=500&auto=format&fit=crop'
      },
      {
        name: 'Hiking & Trekking',
        type: 'sports' as const,
        url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=500&auto=format&fit=crop'
      },
      {
        name: 'Skateboarding',
        type: 'sports' as const,
        url: 'https://images.unsplash.com/photo-1520045892732-304bc3ac5d8e?w=500&auto=format&fit=crop'
      },

      // Food Hobbies
      {
        name: 'Pizza & Pasta',
        type: 'food' as const,
        url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&auto=format&fit=crop'
      },
      {
        name: 'Burgers & Fast Food',
        type: 'food' as const,
        url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop'
      },
      {
        name: 'Sushi & Asian',
        type: 'food' as const,
        url: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=500&auto=format&fit=crop'
      },
      {
        name: 'Fine Dining',
        type: 'food' as const,
        url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop'
      },
      {
        name: 'Coffee & Cafes',
        type: 'food' as const,
        url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&auto=format&fit=crop'
      },
      {
        name: 'Baking & Pastry',
        type: 'food' as const,
        url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&auto=format&fit=crop'
      },
      {
        name: 'Home Cooking',
        type: 'food' as const,
        url: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=500&auto=format&fit=crop'
      },
      {
        name: 'Vegan & Healthy Food',
        type: 'food' as const,
        url: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=500&auto=format&fit=crop'
      },
      {
        name: 'Desserts & Sweets',
        type: 'food' as const,
        url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=500&auto=format&fit=crop'
      },
      {
        name: 'Street Food',
        type: 'food' as const,
        url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500&auto=format&fit=crop'
      },
      {
        name: 'BBQ & Grills',
        type: 'food' as const,
        url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=500&auto=format&fit=crop'
      },
      {
        name: 'Seafood',
        type: 'food' as const,
        url: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=500&auto=format&fit=crop'
      },
      {
        name: 'Biryani & Indian',
        type: 'food' as const,
        url: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=500&auto=format&fit=crop'
      },
      {
        name: 'Tacos & Mexican',
        type: 'food' as const,
        url: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=500&auto=format&fit=crop'
      },
      {
        name: 'Ice Cream & Shakes',
        type: 'food' as const,
        url: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=500&auto=format&fit=crop'
      },
      {
        name: 'Bubble Tea & Drinks',
        type: 'food' as const,
        url: 'https://images.unsplash.com/photo-1558857563-b371f32a76ef?w=500&auto=format&fit=crop'
      },

      // Music Hobbies
      {
        name: 'Pop Music',
        type: 'music' as const,
        url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=500&auto=format&fit=crop'
      },
      {
        name: 'Rock Music',
        type: 'music' as const,
        url: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=500&auto=format&fit=crop'
      },
      {
        name: 'Jazz & Blues',
        type: 'music' as const,
        url: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=500&auto=format&fit=crop'
      },
      {
        name: 'Classical Music',
        type: 'music' as const,
        url: 'https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=500&auto=format&fit=crop'
      },
      {
        name: 'Hip Hop & Rap',
        type: 'music' as const,
        url: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=500&auto=format&fit=crop'
      },
      {
        name: 'R&B & Soul',
        type: 'music' as const,
        url: 'https://images.unsplash.com/photo-1487180142328-0c4e37023af5?w=500&auto=format&fit=crop'
      },
      {
        name: 'Electronic & EDM',
        type: 'music' as const,
        url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop'
      },
      {
        name: 'Acoustic & Folk',
        type: 'music' as const,
        url: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=500&auto=format&fit=crop'
      },
      {
        name: 'Bollywood & Desi',
        type: 'music' as const,
        url: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=500&auto=format&fit=crop'
      },
      {
        name: 'K-Pop',
        type: 'music' as const,
        url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop'
      },
      {
        name: 'Lo-Fi & Chillhop',
        type: 'music' as const,
        url: 'https://images.unsplash.com/photo-1445985543469-433ecdd625a6?w=500&auto=format&fit=crop'
      },
      {
        name: 'Country & Indie',
        type: 'music' as const,
        url: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=500&auto=format&fit=crop'
      },
    ];

    for (const data of hobbiesData) {
      let media = await Media.findOne({ url: data.url });
      if (!media) {
        media = await Media.create({
          url: data.url,
          mimetype: 'image/jpeg',
          type: 'image'
        });
      }

      await Hobby.findOneAndUpdate(
        { name: data.name, type: data.type },
        { name: data.name, type: data.type, image: media._id, isActive: true },
        { upsert: true, new: true }
      );
    }
    AppLogger.info(`✅ Seeded ${hobbiesData.length} hobbies (sports, food, music) successfully`);
  } catch (error) {
    AppLogger.error('❌ Error seeding hobbies:', error);
  }
}

