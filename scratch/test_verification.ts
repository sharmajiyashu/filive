import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });

import createDbConnection from '../src/api/loaders/db';
import Country from '../src/models/Country';
import { getCountryPhoneCode } from '../src/utils/phoneCountry';
import { Container } from 'typedi';
import { RankingService } from '../src/services/app/RankingService';

async function test() {
  await createDbConnection();

  console.log('--- Testing Country Integer Codes ---');
  const countries = await Country.find({ isActive: true }).sort({ name: 1 }).lean();
  const sample = countries.slice(0, 5).map((c: any) => ({
    name: c.name,
    code: c.code,
    phoneCode: c.phoneCode ?? c.countryCode ?? getCountryPhoneCode(c.code),
    countryCode: c.phoneCode ?? c.countryCode ?? getCountryPhoneCode(c.code),
  }));
  console.log('Sample countries output:', JSON.stringify(sample, null, 2));

  console.log('--- Testing Regional Rankings ---');
  const rankingService = Container.get(RankingService);
  const inRich = await rankingService.getRanking('rich', 'daily', 1, 10, 'IN');
  console.log('India Rich Daily Ranking count:', inRich.length);
  if (inRich.length > 0) {
    console.log('Top India Rich user:', inRich[0].user.name, 'Score:', inRich[0].score, 'Country:', inRich[0].user.country);
  }

  const aeCharm = await rankingService.getRanking('charm', 'daily', 1, 10, 'AE');
  console.log('UAE Charm Daily Ranking count:', aeCharm.length);
  if (aeCharm.length > 0) {
    console.log('Top UAE Charm user:', aeCharm[0].user.name, 'Score:', aeCharm[0].score, 'Country:', aeCharm[0].user.country);
  }

  process.exit(0);
}

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
