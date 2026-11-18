import { Request, Response, NextFunction } from 'express';
import User from '../../models/User';
import { ForbiddenError, UnauthorizedError } from './errors';

const ROUTE_MODULE_PREFIXES: Array<{ prefix: string; moduleName: string }> = [
  // User Management
  { prefix: '/user', moduleName: 'User Management' },
  { prefix: '/verified-user', moduleName: 'Verified Users' },
  { prefix: '/video-verification', moduleName: 'Video Verifications' },
  { prefix: '/coin-trader', moduleName: 'Coin Trader' },
  { prefix: '/coinseller', moduleName: 'Coin Trader' },

  // Profile Management
  { prefix: '/career', moduleName: 'Profile Management' },
  { prefix: '/hobby', moduleName: 'Profile Management' },

  // Support & Reports
  { prefix: '/support', moduleName: 'Support Chat' },
  { prefix: '/report', moduleName: 'Reports Management' },

  // Beans, Coins & Payout
  { prefix: '/bean', moduleName: 'Beans Management' },
  { prefix: '/coins', moduleName: 'Coins Management' },
  { prefix: '/payout', moduleName: 'Payout Management' },

  // Stores & Catalog
  { prefix: '/store', moduleName: 'Stores Management' },
  { prefix: '/gift', moduleName: 'Gifts Management' },
  { prefix: '/reaction', moduleName: 'Reactions Management' },
  { prefix: '/game', moduleName: 'Games Management' },
  { prefix: '/music', moduleName: 'Music Management' },
  { prefix: '/roomtheme', moduleName: 'Room Themes' },
  { prefix: '/room-theme', moduleName: 'Room Themes' },

  // Live & Audio & Calls
  { prefix: '/live', moduleName: 'Live Content' },
  { prefix: '/call', moduleName: 'Call Management' },
  { prefix: '/room', moduleName: 'Rooms' },
  { prefix: '/famil', moduleName: 'Families' },

  // Content & Gamification
  { prefix: '/level', moduleName: 'Levels' },
  { prefix: '/stor', moduleName: 'Stories' },
  { prefix: '/hashtag', moduleName: 'Hashtags Management' },
  { prefix: '/announcement', moduleName: 'Announcements' },
  { prefix: '/banner', moduleName: 'Banner Management' },

  // Agencies & Feedback
  { prefix: '/agenc', moduleName: 'Agencies Management' },
  { prefix: '/help', moduleName: 'Help & Feedback' },

  // Recharge & VIP
  { prefix: '/coinpackage', moduleName: 'Recharge & Coin Packages' },
  { prefix: '/coin-package', moduleName: 'Recharge & Coin Packages' },
  { prefix: '/user-recharge-plan', moduleName: 'Recharge & Coin Packages' },
  { prefix: '/seller-recharge-plan', moduleName: 'Recharge & Coin Packages' },
  { prefix: '/vip', moduleName: 'VIP Plans' },

  // Website
  { prefix: '/website', moduleName: 'Website Management' },
  { prefix: '/teamapplication', moduleName: 'Website Management' },
  { prefix: '/team-application', moduleName: 'Website Management' },
  { prefix: '/contactmessage', moduleName: 'Website Management' },
  { prefix: '/contact-message', moduleName: 'Website Management' },

  // Roles & Staff Administration
  { prefix: '/role', moduleName: 'Roles & Permissions' },
  { prefix: '/adminuser', moduleName: 'Admin Users & Staff' },
  { prefix: '/admin-user', moduleName: 'Admin Users & Staff' },
  { prefix: '/adminusers', moduleName: 'Admin Users & Staff' },
  { prefix: '/admin-users', moduleName: 'Admin Users & Staff' },

  // Settings & Gateways
  { prefix: '/app-setting', moduleName: 'App Settings & Gateways' },
  { prefix: '/appsetting', moduleName: 'App Settings & Gateways' },
  { prefix: '/paymentmethod', moduleName: 'App Settings & Gateways' },
  { prefix: '/payment-method', moduleName: 'App Settings & Gateways' },
  { prefix: '/country', moduleName: 'App Settings & Gateways' },
  { prefix: '/notification', moduleName: 'App Settings & Gateways' },
  { prefix: '/sociallink', moduleName: 'App Settings & Gateways' },
  { prefix: '/social-link', moduleName: 'App Settings & Gateways' },

  // Dashboard
  { prefix: '/dashboard', moduleName: 'Dashboard' },
];

const UNRESTRICTED_ADMIN_PATHS = ['/login', '/logout', '/me', '/auth/me', '/health'];

export async function adminPermissionMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const rawPath = (req.path || '').toLowerCase();
    if (UNRESTRICTED_ADMIN_PATHS.some((p) => rawPath === p || rawPath.startsWith(p + '/'))) {
      return next();
    }

    const userId = req.user?.id;
    if (!userId) {
      return next(new UnauthorizedError(new Error('Authentication required')));
    }

    const user = await User.findById(userId).populate('adminRoleId').lean();
    if (!user || user.userRole !== 'admin') {
      return next(new ForbiddenError(new Error('Access denied: Administrators only')));
    }

    // Disabled staff check
    const isDeactivated = user.isBlocked === true || (user as any).isActive === false || (user as any).status === 'inactive' || (user as any).status === 'disabled' || (user as any).status === 'suspended';
    if (isDeactivated) {
      return next(
        new UnauthorizedError(new Error('ACCOUNT_DISABLED: Your staff account has been deactivated or disabled'))
      );
    }

    // Master Super Admins always bypass checks
    const isSuperAdmin =
      user.email === 'admin@example.com' ||
      user.email === 'filive@gmail.com' ||
      (user.adminRoleId as any)?.name === 'SUPER_ADMIN';

    if (isSuperAdmin) {
      return next();
    }

    const role = user.adminRoleId as any;
    if (!role || role.isActive === false) {
      return next(new ForbiddenError(new Error('No active administrative role assigned to this staff account')));
    }

    // Match route to required module
    const matched = ROUTE_MODULE_PREFIXES.find((item) => rawPath.startsWith(item.prefix.toLowerCase()));
    if (!matched) {
      // If not specifically mapped to a restricted module, allow
      return next();
    }

    const permissions: any[] = role.permissions || [];
    const modulePerm = permissions.find(
      (m: any) => (m.moduleName || '').trim().toLowerCase() === matched.moduleName.toLowerCase()
    );

    if (!modulePerm || modulePerm.enabled === false) {
      return next(
        new ForbiddenError(new Error(`Access denied: You do not have permission for module "${matched.moduleName}"`))
      );
    }

    next();
  } catch (err: any) {
    next(err);
  }
}

export function checkPermission(moduleName: string, featureKey?: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next(new UnauthorizedError(new Error('Authentication required')));
      }

      const user = await User.findById(userId).populate('adminRoleId');
      if (!user || user.userRole !== 'admin') {
        return next(new ForbiddenError(new Error('Access denied: Administrators only')));
      }

      if (user.isBlocked) {
        return next(
          new UnauthorizedError(new Error('ACCOUNT_DISABLED: Your staff account has been deactivated or disabled'))
        );
      }

      // Master Super Admins always bypass granular checks
      if (
        user.email === 'admin@example.com' ||
        user.email === 'filive@gmail.com' ||
        (user.adminRoleId as any)?.name === 'SUPER_ADMIN' ||
        (!user.adminRoleId && user.userRole === 'admin')
      ) {
        return next();
      }

      const role = user.adminRoleId as any;
      if (!role || role.isActive === false) {
        return next(new ForbiddenError(new Error('No active role assigned to this staff account')));
      }

      const permissions = role.permissions || [];
      const matchedModule = permissions.find(
        (m: any) => m.moduleName?.toLowerCase() === moduleName.toLowerCase()
      );

      if (!matchedModule || matchedModule.enabled === false) {
        return next(
          new ForbiddenError(new Error(`Access denied: You do not have permission for module "${moduleName}"`))
        );
      }

      if (featureKey && matchedModule.features) {
        const feature = matchedModule.features[featureKey];
        if (feature && feature.enabled === false) {
          return next(
            new ForbiddenError(new Error(`Access denied: You do not have permission to execute "${featureKey}"`))
          );
        }
      }

      next();
    } catch (err: any) {
      next(err);
    }
  };
}
