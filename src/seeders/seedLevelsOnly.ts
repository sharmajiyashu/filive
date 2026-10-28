import dotenv from 'dotenv';
import path from 'path';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  // Ignore
}

dotenv.config({ path: path.join(process.cwd(), '.env') });

import createDbConnection from '../api/loaders/db';
import { seedLevels } from './LevelSeeder';
import AppLogger from '../api/loaders/logger';

async function main() {
  try {
    await createDbConnection();
    AppLogger.info('🌱 Seeding rich and charm levels...');
    await seedLevels();
    AppLogger.info('🎉 Level seeding finished successfully.');
    process.exit(0);
  } catch (err) {
    AppLogger.error('❌ Failed to seed levels:', err);
    process.exit(1);
  }
}

main();
