import { Router } from 'express';
import app from './app';
import admin from './admin';
import web from './web';
import { appAuthMiddleware } from '../middleware/appAuthMiddleware';
import { adminAuthMiddleware } from '../middleware/adminAuthMiddleware';
import { adminPermissionMiddleware } from '../middleware/checkPermission';

export default (): Router => {
    const router: Router = Router();

    const appRouter = Router();
    appRouter.use(appAuthMiddleware);
    app(appRouter);
    router.use('/app', appRouter);

    const adminRouter = Router();
    adminRouter.use(adminAuthMiddleware);
    adminRouter.use(adminPermissionMiddleware);
    admin(adminRouter);
    router.use('/admin', adminRouter);

    const webRouter = Router();
    web(webRouter);
    router.use('/web', webRouter);

    return router;
};