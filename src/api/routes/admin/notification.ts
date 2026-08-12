import { Router, Response } from 'express';
import Container from 'typedi';
import { AdminLiveService } from '../../../services/admin/AdminLiveService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const adminLiveService = Container.get(AdminLiveService);
  const notificationRouter = Router();

  router.use('/notifications', adminAuthMiddleware, notificationRouter);

  notificationRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');
      const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
      const result = await adminLiveService.getNotifications({ page, limit, unreadOnly });
      return ResponseWrapper.success(res, result, 'Notifications fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  notificationRouter.patch('/read-all', async (_req: any, res: Response) => {
    try {
      const result = await adminLiveService.markAllNotificationsRead();
      return ResponseWrapper.success(res, result, 'All notifications marked as read');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  notificationRouter.patch('/:id/read', async (req: any, res: Response) => {
    try {
      const result = await adminLiveService.markNotificationRead(req.params.id);
      return ResponseWrapper.success(res, result, 'Notification marked as read');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
