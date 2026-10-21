import Hashtag from '../models/Hashtag';
import AppLogger from '../api/loaders/logger';

export const INITIAL_HASHTAGS = [
  { name: 'DailyLife', isTrending: true, category: 'lifestyle', order: 1, description: 'Share your daily life moments and experiences' },
  { name: 'FiliveLive', isTrending: true, category: 'live', order: 2, description: 'Highlights and clips from Filive live streams' },
  { name: 'Music', isTrending: true, category: 'music', order: 3, description: 'Songs, beats, musical performances and acoustic vibes' },
  { name: 'Gaming', isTrending: true, category: 'gaming', order: 4, description: 'Gameplays, stream highlights, and gamer moments' },
  { name: 'Party', isTrending: true, category: 'party', order: 5, description: 'Parties, fun hangouts, festivals, and DJ sets' },
  { name: 'Dance', isTrending: true, category: 'dance', order: 6, description: 'Choreography, trending dance moves and challenges' },
  { name: 'Travel', isTrending: false, category: 'travel', order: 7, description: 'Wanderlust, scenic views, vacations and adventures' },
  { name: 'Foodie', isTrending: false, category: 'food', order: 8, description: 'Delicious meals, street food, treats and recipes' },
  { name: 'Fitness', isTrending: false, category: 'fitness', order: 9, description: 'Workouts, gym motivation, yoga and wellness' },
  { name: 'Fashion', isTrending: false, category: 'fashion', order: 10, description: 'Outfits, aesthetics, style and beauty trends' },
  { name: 'Friendship', isTrending: false, category: 'lifestyle', order: 11, description: 'Best moments with friends and squad goals' },
  { name: 'Celebration', isTrending: false, category: 'lifestyle', order: 12, description: 'Birthdays, anniversaries, achievements and milestones' },
];

export async function seedHashtags() {
  try {
    for (const item of INITIAL_HASHTAGS) {
      await Hashtag.findOneAndUpdate(
        { name: item.name },
        {
          $setOnInsert: {
            name: item.name,
            description: item.description,
            isTrending: item.isTrending,
            category: item.category,
            order: item.order,
            isActive: true,
            usageCount: 0,
          },
        },
        { upsert: true, new: true }
      );
    }
    AppLogger.info('✅ Hashtags seeded successfully');
  } catch (error) {
    AppLogger.error('❌ Error seeding hashtags:', error);
  }
}
