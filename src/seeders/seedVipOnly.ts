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
import AppLogger from '../api/loaders/logger';
import { seedVipPlans } from './VipPlanSeeder';

async function main() {
  try {
    await createDbConnection();
    AppLogger.info('🌱 Starting VIP Plans seeder...');
    await seedVipPlans();
    AppLogger.info('✅ VIP Plans seeder completed successfully!');
    process.exit(0);
  } catch (err) {
    AppLogger.error('❌ VIP Seeder failed', err);
    process.exit(1);
  }
}

main();
