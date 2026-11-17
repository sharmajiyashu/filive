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
import AppSetting from '../models/AppSetting';
import {
  DEFAULT_PRIVACY_POLICY_TEXT,
  DEFAULT_USER_AGREEMENT_TEXT,
  DEFAULT_REFUND_POLICY_TEXT,
  DEFAULT_CHILD_SAFETY_POLICY_TEXT,
  DEFAULT_LEGAL_EFFECTIVE_DATE,
} from '../constants/legalDocuments';

async function main() {
  try {
    await createDbConnection();
    AppLogger.info('🌱 Starting Legal Documents seeder...');

    const legalSettings = [
      { key: 'privacy_policy_content', value: DEFAULT_PRIVACY_POLICY_TEXT, description: 'Dynamic Privacy Policy full legal text' },
      { key: 'privacy_policy_updated_at', value: DEFAULT_LEGAL_EFFECTIVE_DATE, description: 'Privacy Policy effective date' },
      { key: 'privacy_policy_url', value: 'https://filive.in/privacy-policy', description: 'Privacy Policy official URL' },

      { key: 'user_agreement_content', value: DEFAULT_USER_AGREEMENT_TEXT, description: 'Dynamic User Agreement full legal text' },
      { key: 'user_agreement_updated_at', value: DEFAULT_LEGAL_EFFECTIVE_DATE, description: 'User Agreement effective date' },
      { key: 'terms_conditions_url', value: 'https://filive.in/user-agreement', description: 'User Agreement / Terms official URL' },

      { key: 'refund_policy_content', value: DEFAULT_REFUND_POLICY_TEXT, description: 'Dynamic Refund Policy full legal text' },
      { key: 'refund_policy_updated_at', value: DEFAULT_LEGAL_EFFECTIVE_DATE, description: 'Refund Policy effective date' },
      { key: 'refund_policy_url', value: 'https://filive.in/refund-policy', description: 'Refund Policy official URL' },

      { key: 'child_safety_policy_content', value: DEFAULT_CHILD_SAFETY_POLICY_TEXT, description: 'Dynamic Child Safety Policy full legal text' },
      { key: 'child_safety_policy_updated_at', value: DEFAULT_LEGAL_EFFECTIVE_DATE, description: 'Child Safety Policy effective date' },
      { key: 'child_safety_policy_url', value: 'https://filive.in/child-safety', description: 'Child Safety Policy official URL' },

      { key: 'contact_us_email', value: 'support@filive.in', description: 'Official support and grievance contact email' },
      { key: 'official_website_url', value: 'https://filive.in', description: 'Official web address' },
      { key: 'contact_us_address', value: 'Filive Office, Flat No. 18, Filive Office Road, Near Main Market, Godda, Jharkhand – 814133, India.', description: 'Official registered physical address' },
    ];

    for (const setting of legalSettings) {
      await AppSetting.findOneAndUpdate(
        { key: setting.key },
        setting,
        { upsert: true, new: true }
      );
      AppLogger.info(`Updated setting key: ${setting.key}`);
    }

    AppLogger.info('✅ All 4 Legal policies and contact information seeded successfully into MongoDB!');
    process.exit(0);
  } catch (err) {
    AppLogger.error('❌ Legal Policies Seeder failed', err);
    process.exit(1);
  }
}

main();
