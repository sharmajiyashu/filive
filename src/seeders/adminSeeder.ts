import User from '../models/User';
import * as bcrypt from 'bcrypt';
import { superAdminRoleSeed } from './superAdminRoleSeed';
import AppLogger from '../api/loaders/logger';

export async function adminSeed() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';

    await superAdminRoleSeed();

    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      existingAdmin.name = existingAdmin.name || 'Super Admin';
      existingAdmin.updatedAt = new Date();
      await existingAdmin.save();

      AppLogger.info('Admin already exists, profile updated');
      return;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    await User.create({
      userRole: 'admin',
      email: adminEmail,
      password: hashedPassword,
      name: 'Super Admin',
      location: {
        lat: 0,
        lng: 0,
        address: 'HQ Address',
        city: 'City',
        state: 'State',
        zipcode: '000000'
      }
    });

    AppLogger.info('Admin created with SUPER_ADMIN role');

    // Seed website admin: filive@gmail.com
    const filiveEmail = 'filive@gmail.com';
    const filivePassword = process.env.FILIVE_ADMIN_PASSWORD || 'Filive@123';
    const existingFilive = await User.findOne({ email: filiveEmail });

    if (!existingFilive) {
      const filiveHashed = await bcrypt.hash(filivePassword, 10);
      await User.create({
        userRole: 'admin',
        email: filiveEmail,
        password: filiveHashed,
        name: 'FiLive Website Admin',
        location: {
          lat: 0,
          lng: 0,
          address: 'HQ Website Address',
          city: 'Bangalore',
          state: 'Karnataka',
          zipcode: '560001'
        }
      });
      AppLogger.info('✅ filive@gmail.com created with Website Admin privileges');
    } else if (existingFilive.userRole !== 'admin') {
      existingFilive.userRole = 'admin';
      await existingFilive.save();
      AppLogger.info('✅ filive@gmail.com upgraded to admin role');
    }
  } catch (error) {
    AppLogger.error('Admin seeder failed', error);
  }
}