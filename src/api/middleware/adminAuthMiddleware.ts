import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from './errors';
import _ from 'lodash';
import { AuthenticationService } from '../../services/common/AuthenticationService';
import Container from 'typedi';
import { adminWhitelistRoutes } from '../../constants/adminWhitelistRoutes';

export const adminAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (adminWhitelistRoutes.includes(req.path)) {
            return next();
        }

        const authHeader = req.headers.authorization;

        if (_.isEmpty(authHeader)) {
            return next(new UnauthorizedError(new Error('Authorization header missing')));
        }

        const [authType, accessToken] = authHeader!.split(' ');

        if (_.isEmpty(authType) || authType.toLowerCase() !== 'bearer') {
            return next(new UnauthorizedError(new Error('Invalid authorization type')));
        }

        if (_.isEmpty(accessToken)) {
            return next(new UnauthorizedError(new Error('Access token missing')));
        }

        const authService = Container.get(AuthenticationService);
        const user = await authService.verifyToken(accessToken);

        if (!user) {
            return next(new UnauthorizedError(new Error('Invalid token')));
        }

        if (user.userRole !== 'admin') {
            return next(new UnauthorizedError(new Error('User is not an admin')));
        }

        if (user.isBlocked === true) {
            return next(new UnauthorizedError(new Error('ACCOUNT_DISABLED: Your staff account has been deactivated or disabled by administrator.')));
        }

        if (user.adminRoleId) {
            const AdminRole = (await import('../../models/AdminRole')).default;
            const role = typeof user.adminRoleId === 'object' && (user.adminRoleId as any)._id
                ? user.adminRoleId
                : await AdminRole.findById(user.adminRoleId).select('isActive').lean();
            if (role && (role as any).isActive === false) {
                return next(new UnauthorizedError(new Error('ROLE_DISABLED: Your assigned administrative role has been deactivated.')));
            }
        }

        req.user = {
            id: user.id as string,
            userRole: user.userRole,
            adminRoleId: user.adminRoleId ? user.adminRoleId.toString() : null
        };
        next();
    } catch (error) {
        next(new UnauthorizedError(error));
    }
};
