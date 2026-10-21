import { PermissionModule } from "../../../interfaces";

export const adminUserPermission: PermissionModule = {
    moduleName: 'Admin User',
    enabled: false,
    features: {
        'admin:user:create': {
            enabled: false,
            description: 'Create admin user'
        },
        'admin:user:update': {
            enabled: false,
            description: 'Update admin user'
        },
        'admin:user:delete': {
            enabled: false,
            description: 'Delete admin user'
        },
        'admin:user:get': {
            enabled: false,
            description: 'Get admin user'
        }
    }
}