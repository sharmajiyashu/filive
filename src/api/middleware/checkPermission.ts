import { Request, Response, NextFunction } from 'express';
import User from '../../models/User';
import { ForbiddenError, UnauthorizedError } from './errors';

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

      // Master Super Admins always bypass granular checks
      if (
        user.email === 'admin@example.com' ||
        user.email === 'filive@gmail.com' ||
        (user.adminRoleId as any)?.name === 'SUPER_ADMIN'
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
