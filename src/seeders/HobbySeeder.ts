import Hobby from '../models/Hobby';
import Media from '../models/Media';
import AppLogger from '../api/loaders/logger';

export async function seedHobbies() {
  try {
    const hobbiesData = [
      // Sports Hobbies
      { 
        name: 'Football', 
        type: 'sports',
        url: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Basketball', 
        type: 'sports',
        url: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Cricket', 
        type: 'sports',
        url: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Tennis', 
        type: 'sports',
        url: 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Badminton', 
        type: 'sports',
        url: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Swimming', 
        type: 'sports',
        url: 'https://images.unsplash.com/photo-1519315901367-f34ff9154487?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Gym & Fitness', 
        type: 'sports',
        url: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Yoga', 
        type: 'sports',
        url: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=500&auto=format&fit=crop' 
      },

      // Food Hobbies
      { 
        name: 'Pizza & Pasta', 
        type: 'food',
        url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Burgers & Fast Food', 
        type: 'food',
        url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Sushi & Asian Food', 
        type: 'food',
        url: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Fine Dining', 
        type: 'food',
        url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Coffee & Cafes', 
        type: 'food',
        url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Baking & Pastry', 
        type: 'food',
        url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Cooking', 
        type: 'food',
        url: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Vegan & Healthy Food', 
        type: 'food',
        url: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=500&auto=format&fit=crop' 
      },

      // Music Hobbies
      { 
        name: 'Pop Music', 
        type: 'music',
        url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Rock Music', 
        type: 'music',
        url: 'https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Jazz & Blues', 
        type: 'music',
        url: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Classical Music', 
        type: 'music',
        url: 'https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Hip Hop & Rap', 
        type: 'music',
        url: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'R&B & Soul', 
        type: 'music',
        url: 'https://images.unsplash.com/photo-1487180142328-0c4e37023af5?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Electronic & EDM', 
        type: 'music',
        url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop' 
      },
      { 
        name: 'Acoustic & Folk', 
        type: 'music',
        url: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=500&auto=format&fit=crop' 
      },
    ];

    for (const data of hobbiesData) {
      // Find or create the Media entry for this hobby
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
    AppLogger.info('✅ Hobbies seeded with media images');
  } catch (error) {
    AppLogger.error('❌ Error seeding hobbies:', error);
  }
}
