import dotenv from 'dotenv';
import path from 'path';
import dns from 'node:dns';

// Fix for ECONNREFUSED / DNS resolution issues in Node 18+ on some networks
dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  // Ignore
}

dotenv.config({ path: path.join(process.cwd(), '.env') });

import createDbConnection from '../api/loaders/db';
import AppLogger from '../api/loaders/logger';
import { seedCareers } from './CareerSeeder';
import { seedHobbies } from './HobbySeeder';
import { seedSettings } from './SettingSeeder';

export async function runProfileOptionsSeeder() {
  try {
    await createDbConnection();
    AppLogger.info('🌱 Starting Profile Options Seeder (Careers, Sports, Food, Music, Emotional States, Height/Weight)...');

    // 1. Seed App Settings (Emotional state/marital_statuses, height/weight options)
    await seedSettings();

    // 2. Seed Careers
    await seedCareers();

    // 3. Seed Hobbies (Sports, Food, Music)
    await seedHobbies();

    AppLogger.info('✨ Profile options seeded successfully!');
    process.exit(0);
  } catch (err) {
    AppLogger.error('❌ Failed to seed profile options:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  runProfileOptionsSeeder();
}
