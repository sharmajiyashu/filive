import { Router, Response } from 'express';
import Container from 'typedi';
import { AdminCallService } from '../../../services/admin/AdminCallService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const callService = Container.get(AdminCallService);
  const callRouter = Router();

  router.use('/calls', adminAuthMiddleware, callRouter);

  callRouter.get('/stats', async (_req: any, res: Response) => {
    try {
      const result = await callService.getStats();
      return ResponseWrapper.success(res, result, 'Call stats fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  callRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const search = req.query.search?.toString();
      const status = req.query.status?.toString();
      const type = (req.query.type || req.query.callType)?.toString();
      const result = await callService.list({ page, limit, search, status, type });
      return ResponseWrapper.success(res, result, 'Calls fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  callRouter.get('/:id', async (req: any, res: Response) => {
    try {
      const result = await callService.getById(req.params.id);
      return ResponseWrapper.success(res, result, 'Call details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
