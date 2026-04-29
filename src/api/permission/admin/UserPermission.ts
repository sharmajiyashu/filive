import { PermissionModule } from "../../../interfaces";

export const adminUserPermission: PermissionModule = {
    moduleName: 'Admin User',
    enabled: false,
    features: {
        'admin:user:create': {
            enabled: false,
            description: { en: 'Create admin user' }
        },
        'admin:user:update': {
            enabled: false,
            description: { en: 'Update admin user' }
        },
        'admin:user:delete': {
            enabled: false,
            description: { en: 'Delete admin user' }
        },
        'admin:user:get': {
            enabled: false,
            description: { en: 'Get admin user' }
        }
    }
}