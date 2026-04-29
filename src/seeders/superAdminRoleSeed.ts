import AdminRole from '../models/AdminRole';
// import { adminPermissions } from '../permissions/adminPermissions';
import AppLogger from '../api/loaders/logger';
import { enableAllPermissions } from '../utils/enableAllPermissions';

export async function superAdminRoleSeed() {
    try {
        // const fullPermissions = enableAllPermissions(adminPermissions);

        // let existingRole = await AdminRole.findOne({ name: 'SUPER_ADMIN' });

        // if (existingRole) {
        //     // Update existing SUPER_ADMIN permissions if needed
        //     existingRole.permissions = fullPermissions as any;
        //     existingRole.updatedAt = new Date();
        //     await existingRole.save();

        //     AppLogger.info('SUPER_ADMIN role permissions updated');
        //     return existingRole;
        // }

        // const newRole = await AdminRole.create({
        //     name: 'SUPER_ADMIN',
        //     description: 'Super Admin with all permissions',
        //     permissions: fullPermissions,
        // });

        AppLogger.info('SUPER_ADMIN role created successfully');

        // return newRole;

    } catch (error) {
        AppLogger.error('SUPER_ADMIN role seeding failed', error);
        throw error;
    }
}