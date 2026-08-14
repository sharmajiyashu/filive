import dotenv from 'dotenv';
import path from 'path';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {}

dotenv.config({ path: path.join(process.cwd(), '.env') });

import createDbConnection from '../src/api/loaders/db';
import '../src/models/Media';
import { seedRegionalRankingUsers } from '../src/seeders/RegionalRankingSeeder';
import Country from '../src/models/Country';
import { getCountryPhoneCode } from '../src/utils/phoneCountry';
import { RankingService } from '../src/services/app/RankingService';
import { LevelService } from '../src/services/app/LevelService';

async function main() {
  await createDbConnection();
  console.log('--- Running Regional Ranking Seeder ---');
  await seedRegionalRankingUsers();

  console.log('\n--- Verifying Country Phone Codes ---');
  const countries = await Country.find({ isActive: true }).sort({ name: 1 }).lean();
  const sample = countries.slice(0, 5).map((c: any) => ({
    name: c.name,
    code: c.code,
    phoneCode: c.phoneCode ?? c.countryCode ?? getCountryPhoneCode(c.code),
    countryCode: c.phoneCode ?? c.countryCode ?? getCountryPhoneCode(c.code),
  }));
  console.log('Sample countries with integer codes:', sample);

  console.log('\n--- Verifying Regional Rankings ---');
  const levelService = new LevelService();
  const rankingService = new RankingService(levelService);
  const inRich = await rankingService.getRanking('rich', 'daily', 1, 10, 'IN');
  console.log('India (IN) Rich Daily Rankings count:', inRich.length);
  inRich.forEach((item: any) => {
    console.log(`Rank #${item.position}: ${item.user.name} - Score: ${item.score} (Country: ${item.user.country})`);
  });

  const aeCharm = await rankingService.getRanking('charm', 'daily', 1, 10, 'AE');
  console.log('\nUAE (AE) Charm Daily Rankings count:', aeCharm.length);
  aeCharm.forEach((item: any) => {
    console.log(`Rank #${item.position}: ${item.user.name} - Score: ${item.score} (Country: ${item.user.country})`);
  });

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
