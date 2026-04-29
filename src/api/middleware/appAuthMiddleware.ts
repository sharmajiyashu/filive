import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from './errors';
import _ from 'lodash';
import { AuthenticationService } from '../../services/common/AuthenticationService';
import Container from 'typedi';
import { appWhitelistRoutes } from '../../constants/appWhitelistRoutes';

export const appAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const skipAuth = appWhitelistRoutes.some(path => req.path === path || req.path.startsWith(path + '/'));

        const authHeader = req.headers.authorization;

        if (_.isEmpty(authHeader)) {
            if (skipAuth) return next();
            return next(new UnauthorizedError(new Error('Authorization header missing')));
        }

        const [authType, accessToken] = authHeader!.split(' ');

        if (_.isEmpty(authType) || authType.toLowerCase() !== 'bearer') {
            if (skipAuth) return next();
            return next(new UnauthorizedError(new Error('Invalid authorization type')));
        }

        if (_.isEmpty(accessToken)) {
            if (skipAuth) return next();
            return next(new UnauthorizedError(new Error('Access token missing')));
        }

        const authService = Container.get(AuthenticationService);
        try {
            const user = await authService.verifyToken(accessToken);

            if (!user) {
                if (skipAuth) return next();
                return next(new UnauthorizedError(new Error('Invalid token')));
            }

            req.user = {
                id: user.id as string,
                userRole: user.userRole,
                adminRoleId: user.adminRoleId ? user.adminRoleId.toString() : null
            };
            next();
        } catch (error) {
            if (skipAuth) return next();
            return next(new UnauthorizedError(error));
        }
    } catch (error) {
        next(new UnauthorizedError(error));
    }
};
