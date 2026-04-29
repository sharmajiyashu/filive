import 'dotenv/config';
import createDbConnection from '../api/loaders/db';
import { seedSettings } from './SettingSeeder';
import AppLogger from '../api/loaders/logger';
import { adminSeed } from './adminSeeder';
import { seedUsers } from './UserSeeder';

async function main() {
  try {
    // 1️⃣ Get DB connection
    await createDbConnection();

    AppLogger.info('🌱 Starting database seeders...');

    // 2️⃣ Run the Settings Seeder
    await seedSettings();
    await adminSeed();
    await seedUsers();

    AppLogger.info('✅ All seeders completed successfully!');
    process.exit(0);
  } catch (err) {
    AppLogger.error('❌ Seeder failed', err);
    process.exit(1);
  }
}

main();
