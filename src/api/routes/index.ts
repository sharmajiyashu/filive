import { Router } from 'express';
import app from './app';
import admin from './admin';
import { appAuthMiddleware } from '../middleware/appAuthMiddleware';
import { adminAuthMiddleware } from '../middleware/adminAuthMiddleware';

export default (): Router => {
    const router: Router = Router();

    const appRouter = Router();
    appRouter.use(appAuthMiddleware);
    app(appRouter);
    router.use('/app', appRouter);

    const adminRouter = Router();
    adminRouter.use(adminAuthMiddleware);
    admin(adminRouter);
    router.use('/admin', adminRouter);

    return router;
};