import { Router, Response } from 'express';
import Container from 'typedi';
import { ReportAdminService } from '../../../services/admin/ReportAdminService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const reportAdminService = Container.get(ReportAdminService);
  const reportRouter = Router();

  router.use('/reports', adminAuthMiddleware, reportRouter);

  /**
   * @swagger
   * /admin/reports/stats:
   *   get:
   *     summary: Get overview statistics for reports dashboard
   *     tags: [Admin - Reports]
   */
  reportRouter.get('/stats', async (req: any, res: Response) => {
    try {
      const stats = await reportAdminService.getReportsStats();
      return ResponseWrapper.success(res, stats, 'Report stats fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/reports:
   *   get:
   *     summary: Get filtered reports with multiple complaint counts
   *     tags: [Admin - Reports]
   */
  reportRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const reportType = req.query.reportType?.toString();
      const status = req.query.status?.toString();
      const priority = req.query.priority?.toString();
      const search = req.query.search?.toString();
      const startDate = req.query.startDate?.toString();
      const endDate = req.query.endDate?.toString();

      const result = await reportAdminService.getReports({
        page,
        limit,
        reportType,
        status,
        priority,
        search,
        startDate,
        endDate,
      });

      return ResponseWrapper.success(res, result, 'Reports fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/appeals:
   *   get:
   *     summary: List appeals submitted by users
   *     tags: [Admin - Reports]
   */
  reportRouter.get('/all/appeals', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const status = req.query.status?.toString();

      const result = await reportAdminService.getAppeals({ page, limit, status });
      return ResponseWrapper.success(res, result, 'Appeals fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/appeals/{id}/review:
   *   put:
   *     summary: Review appeal (accept and revoke penalty or reject)
   *     tags: [Admin - Reports]
   */
  reportRouter.put('/appeals/:id/review', async (req: any, res: Response) => {
    try {
      const adminUser = {
        id: req.user?.id,
        name: req.user?.name || req.user?.email || 'Admin',
      };

      const result = await reportAdminService.reviewAppeal(req.params.id, adminUser, req.body);
      return ResponseWrapper.success(res, result, 'Appeal reviewed successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/reports/{id}:
   *   get:
   *     summary: Get single report details including evidence and group history
   *     tags: [Admin - Reports]
   */
  reportRouter.get('/:id', async (req: any, res: Response) => {
    try {
      const report = await reportAdminService.getReportById(req.params.id);
      return ResponseWrapper.success(res, report, 'Report details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/reports/{id}/status:
   *   put:
   *     summary: Update report status (under_review, rejected, resolved)
   *     tags: [Admin - Reports]
   */
  reportRouter.put('/:id/status', async (req: any, res: Response) => {
    try {
      const { status, notes } = req.body;
      const adminId = req.user?.id;
      const adminName = req.user?.name || req.user?.email || 'Admin';

      const updated = await reportAdminService.updateReportStatus(
        req.params.id,
        status,
        adminId,
        adminName,
        notes
      );

      return ResponseWrapper.success(res, updated, `Report status updated to ${status}`);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/reports/{id}/action:
   *   post:
   *     summary: Take moderation action on report (warning, ban, remove content, etc.)
   *     tags: [Admin - Reports]
   */
  reportRouter.post('/:id/action', async (req: any, res: Response) => {
    try {
      const adminUser = {
        id: req.user?.id,
        name: req.user?.name || req.user?.email || 'Admin',
      };

      const result = await reportAdminService.takeAction(req.params.id, adminUser, req.body);
      return ResponseWrapper.success(res, result, 'Action executed and logged successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
