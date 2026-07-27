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
import { seedMusic } from './MusicSeeder';

async function main() {
  try {
    await createDbConnection();
    AppLogger.info('🌱 Starting Music seeder...');
    
    await seedMusic();

    AppLogger.info('✅ Music seeded successfully!');
    process.exit(0);
  } catch (err) {
    AppLogger.error('❌ Music seeder failed', err);
    process.exit(1);
  }
}

main();
