import AdminRole from '../models/AdminRole';
import { allAdminPermissions } from '../api/permission/admin/adminPermissions';
import AppLogger from '../api/loaders/logger';
import { enableAllPermissions } from '../utils/enableAllPermissions';

export async function superAdminRoleSeed() {
  try {
    const fullPermissions = enableAllPermissions(allAdminPermissions);

    let existingRole = await AdminRole.findOne({ name: 'SUPER_ADMIN' });

    if (existingRole) {
      existingRole.permissions = fullPermissions as any;
      existingRole.isActive = true;
      existingRole.updatedAt = new Date();
      await existingRole.save();

      AppLogger.info('✅ SUPER_ADMIN role permissions updated successfully');
      return existingRole;
    }

    const newRole = await AdminRole.create({
      name: 'SUPER_ADMIN',
      description: 'Super Administrator with full master access to all modules and controls',
      permissions: fullPermissions,
      isActive: true,
    });

    AppLogger.info('✅ SUPER_ADMIN role created successfully');
    return newRole;
  } catch (error) {
    AppLogger.error('❌ SUPER_ADMIN role seeding failed', error);
    throw error;
  }
}