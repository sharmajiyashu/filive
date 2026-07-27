import mongoose from 'mongoose';
import Music from '../models/Music';
import AppLogger from '../api/loaders/logger';

const dummyMusic = [
  {
    title: 'Chill Beats',
    artist: 'Lofi Girl',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    coverImage: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&q=80',
    duration: 120,
    isActive: true,
  },
  {
    title: 'Upbeat Pop',
    artist: 'Pop Star',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    coverImage: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80',
    duration: 180,
    isActive: true,
  },
  {
    title: 'Acoustic Sunrise',
    artist: 'Indie Artist',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    coverImage: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=500&q=80',
    duration: 150,
    isActive: true,
  }
];

export const seedMusic = async () => {
  try {
    const count = await Music.countDocuments();
    if (count === 0) {
      await Music.insertMany(dummyMusic);
      AppLogger.info('Music seeded successfully!');
    } else {
      AppLogger.info('Music already seeded.');
    }
  } catch (error) {
    AppLogger.error('Error seeding Music:', error);
  }
};
