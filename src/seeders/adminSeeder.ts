import User from '../models/User';
import * as bcrypt from 'bcrypt';
import { superAdminRoleSeed } from './superAdminRoleSeed';
import AppLogger from '../api/loaders/logger';

export async function adminSeed() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';

    const superAdminRole = await superAdminRoleSeed();

    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      existingAdmin.name = existingAdmin.name || 'Super Admin';
      existingAdmin.userRole = 'admin';
      if (superAdminRole) {
        existingAdmin.adminRoleId = superAdminRole._id as any;
      }
      existingAdmin.updatedAt = new Date();
      await existingAdmin.save();

      AppLogger.info('✅ Admin already exists, profile and SUPER_ADMIN role updated');
    } else {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await User.create({
        userRole: 'admin',
        email: adminEmail,
        password: hashedPassword,
        name: 'Super Admin',
        adminRoleId: superAdminRole?._id,
        location: {
          lat: 0,
          lng: 0,
          address: 'HQ Address',
          city: 'City',
          state: 'State',
          zipcode: '000000',
        },
      });
      AppLogger.info('✅ Admin created with SUPER_ADMIN role');
    }

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
        adminRoleId: superAdminRole?._id,
        location: {
          lat: 0,
          lng: 0,
          address: 'HQ Website Address',
          city: 'Bangalore',
          state: 'Karnataka',
          zipcode: '560001',
        },
      });
      AppLogger.info('✅ filive@gmail.com created with Website Admin privileges & SUPER_ADMIN role');
    } else {
      existingFilive.userRole = 'admin';
      if (superAdminRole && !existingFilive.adminRoleId) {
        existingFilive.adminRoleId = superAdminRole._id as any;
      }
      await existingFilive.save();
      AppLogger.info('✅ filive@gmail.com ensured admin role & SUPER_ADMIN assigned');
    }
  } catch (error) {
    AppLogger.error('❌ Admin seeder failed', error);
  }
}