import dotenv from 'dotenv';
import path from 'path';
import dns from 'node:dns';

// Fix for ECONNREFUSED / DNS resolution issues in Node 18+ on some networks
dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  // Ignore if this fails due to environment restrictions
}

dotenv.config({ path: path.join(process.cwd(), '.env') });

import createDbConnection from '../api/loaders/db';
import { seedSettings } from './SettingSeeder';
import AppLogger from '../api/loaders/logger';
import { adminSeed } from './adminSeeder';
import { seedUsers } from './UserSeeder';
import { seedCoinPackages } from './CoinPackageSeeder';
import { seedCountries } from './CountrySeeder';
import { seedLanguages } from './LanguageSeeder';
import { seedCareers } from './CareerSeeder';
import { seedHobbies } from './HobbySeeder';
import { seedLevels } from './LevelSeeder';
import { seedCommissionSlabs } from './CommissionSlabSeeder';
import { seedGifts } from './GiftSeeder';
import { seedRoomThemes } from './RoomThemeSeeder';

async function main() {
  try {
    // 1️⃣ Get DB connection
    await createDbConnection();

    AppLogger.info('🌱 Starting database seeders...');

    // 2️⃣ Run the Settings Seeder
    await seedSettings();
    await adminSeed();
    await seedUsers();
    await seedCoinPackages();
    await seedCountries();
    await seedLanguages();
    await seedCareers();
    await seedHobbies();
    await seedLevels();
    await seedCommissionSlabs();
    await seedGifts();
    await seedRoomThemes();

    AppLogger.info('✅ All seeders completed successfully!');
    process.exit(0);
  } catch (err) {
    AppLogger.error('❌ Seeder failed', err);
    process.exit(1);
  }
}

main();
