import dotenv from 'dotenv';
import path from 'path';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {}

dotenv.config({ path: path.join(process.cwd(), '.env') });

import createDbConnection from '../api/loaders/db';
import User from '../models/User';
import CoinPackage from '../models/CoinPackage';
import AppSetting from '../models/AppSetting';
import * as bcrypt from 'bcrypt';
import AppLogger from '../api/loaders/logger';

async function seedWebsiteModule() {
  try {
    await createDbConnection();
    AppLogger.info('🚀 Seeding Website Settings, filive@gmail.com Admin, and Website Recharge Plans...');

    // 1. Seed or update website admin: filive@gmail.com
    const filiveEmail = 'filive@gmail.com';
    const filivePassword = process.env.FILIVE_ADMIN_PASSWORD || 'Filive@123';
    let filiveAdmin = await User.findOne({ email: filiveEmail });

    if (!filiveAdmin) {
      const hashedPassword = await bcrypt.hash(filivePassword, 10);
      filiveAdmin = await User.create({
        userRole: 'admin',
        email: filiveEmail,
        password: hashedPassword,
        name: 'FiLive Website Admin',
        location: {
          lat: 0,
          lng: 0,
          address: 'FiLive HQ',
          city: 'Bangalore',
          state: 'Karnataka',
          zipcode: '560001',
        },
      });
      AppLogger.info('✅ Admin user filive@gmail.com created successfully (password: Filive@123)');
    } else {
      filiveAdmin.userRole = 'admin';
      filiveAdmin.name = filiveAdmin.name || 'FiLive Website Admin';
      await filiveAdmin.save();
      AppLogger.info('✅ Admin user filive@gmail.com verified with admin privileges');
    }

    // 2. Seed website settings in AppSetting
    const websiteSettingsDefaults: Record<string, any> = {
      website_enquiry_email: 'filive@gmail.com',
      website_permission_emails: ['filive@gmail.com'],
      website_recharge_enabled: true,
      website_contact_notifications_enabled: true,
    };

    for (const [key, value] of Object.entries(websiteSettingsDefaults)) {
      const existing = await AppSetting.findOne({ key });
      if (!existing) {
        await AppSetting.create({ key, value });
        AppLogger.info(`✅ Setting ${key} created with default value`);
      } else {
        // Ensure filive@gmail.com is in website_permission_emails
        if (key === 'website_permission_emails' && Array.isArray(existing.value)) {
          if (!existing.value.includes('filive@gmail.com')) {
            existing.value.unshift('filive@gmail.com');
            await existing.save();
          }
        }
      }
    }

    // 3. Seed Website Recharge Plans
    const websitePackages = [
      { name: 'Starter Pack', coins: 100, bonus: 0, price: 99, targetAudience: 'website', isRecommended: false, isFeatured: false, description: 'Starter package for website recharge', isActive: true },
      { name: 'Popular Pack', coins: 500, bonus: 50, price: 499, targetAudience: 'website', isRecommended: false, isFeatured: true, description: 'Popular coin bundle with bonus', isActive: true },
      { name: 'Value Pack', coins: 1000, bonus: 150, price: 999, targetAudience: 'website', isRecommended: true, isFeatured: true, description: 'Most popular value recharge plan', isActive: true },
      { name: 'Pro Pack', coins: 2500, bonus: 400, price: 2499, targetAudience: 'website', isRecommended: false, isFeatured: false, description: 'Pro streamer & live enthusiast pack', isActive: true },
      { name: 'Elite Pack', coins: 5000, bonus: 1000, price: 4999, targetAudience: 'website', isRecommended: false, isFeatured: true, description: 'Elite recharge pack with 1000 bonus coins', isActive: true },
      { name: 'Master Pack', coins: 10000, bonus: 2500, price: 9999, targetAudience: 'website', isRecommended: false, isFeatured: false, description: 'Master pack for top gifters', isActive: true },
      { name: 'Champion Pack', coins: 25000, bonus: 7000, price: 24999, targetAudience: 'website', isRecommended: false, isFeatured: true, description: 'Champion bundle with massive 7000 bonus', isActive: true },
      { name: 'Legend Pack', coins: 50000, bonus: 15000, price: 49999, targetAudience: 'website', isRecommended: false, isFeatured: true, description: 'Legendary pack for VIP community leaders', isActive: true },
    ];

    for (const pkg of websitePackages) {
      await CoinPackage.findOneAndUpdate(
        { name: pkg.name, targetAudience: 'website' },
        pkg,
        { upsert: true, new: true }
      );
    }
    AppLogger.info('✅ 8 Official Website Recharge Packages seeded successfully');

    AppLogger.info('🎉 All Website Settings & Recharge Plans initialized successfully!');
    process.exit(0);
  } catch (err) {
    AppLogger.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seedWebsiteModule();
