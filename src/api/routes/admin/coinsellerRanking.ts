import { Router, Request, Response } from 'express';
import { Container } from 'typedi';
import { CoinsellerRankingService } from '../../../services/app/CoinsellerRankingService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

const router = Router();

export default (adminRouter: Router) => {
  adminRouter.use('/coinseller-ranking', adminAuthMiddleware, router);
  adminRouter.use('/admin/coinseller-ranking', adminAuthMiddleware, router);

  const getService = () => Container.get(CoinsellerRankingService);

  /**
   * GET /admin/coinseller-ranking/settings
   * Get current ranking & promotion configuration
   */
  router.get('/settings', async (req: Request, res: Response) => {
    try {
      const service = getService();
      const settings = await service.getSettings();
      return ResponseWrapper.success(res, settings, 'Ranking settings fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * PUT /admin/coinseller-ranking/settings
   * Update ranking & promotion configuration (weights sum validation)
   */
  router.put('/settings', async (req: Request, res: Response) => {
    try {
      const service = getService();
      const adminUser = (req as any).admin;
      const updated = await service.updateSettings(req.body, adminUser);
      return ResponseWrapper.success(res, updated, 'Ranking settings updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * GET /admin/coinseller-ranking/sellers
   * Get all coinsellers with country, category, 30-day metrics, score, promotion & active status
   */
  router.get('/sellers', async (req: Request, res: Response) => {
    try {
      const service = getService();
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');
      const country = req.query.country?.toString();
      const category = (req.query.category?.toString() || 'all') as any;
      const search = req.query.search?.toString();

      const result = await service.getRankedSellers({
        page,
        limit,
        country,
        category,
        search,
        includeExcluded: true, // In admin view, show excluded sellers with exclusion badges
      });

      return ResponseWrapper.success(res, result, 'Coinseller ranking list fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * POST /admin/coinseller-ranking/exclude
   * Exclude a seller from ranking (requires reason)
   */
  router.post('/exclude', async (req: Request, res: Response) => {
    try {
      const service = getService();
      const adminUser = (req as any).admin;
      const { sellerId, reason } = req.body;
      if (!sellerId || !reason || !reason.trim()) {
        throw new Error('sellerId and a valid reason are required');
      }
      const result = await service.excludeSeller(sellerId, reason, adminUser);
      return ResponseWrapper.success(res, result, result.message);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * POST /admin/coinseller-ranking/restore
   * Restore an excluded seller to ranking
   */
  router.post('/restore', async (req: Request, res: Response) => {
    try {
      const service = getService();
      const adminUser = (req as any).admin;
      const { sellerId, reason } = req.body;
      if (!sellerId) {
        throw new Error('sellerId is required');
      }
      const result = await service.restoreSeller(sellerId, reason, adminUser);
      return ResponseWrapper.success(res, result, result.message);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * PUT /admin/coinseller-ranking/category
   * Update a seller's recharge category (normal, recharge_service, both)
   */
  router.put('/category', async (req: Request, res: Response) => {
    try {
      const service = getService();
      const adminUser = (req as any).admin;
      const { sellerId, category } = req.body;
      if (!sellerId || !category) {
        throw new Error('sellerId and category are required');
      }
      const result = await service.updateSellerCategory(sellerId, category, adminUser);
      return ResponseWrapper.success(res, result, result.message);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * GET /admin/coinseller-ranking/audit-logs
   * Fetch ranking audit logs
   */
  router.get('/audit-logs', async (req: Request, res: Response) => {
    try {
      const service = getService();
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');
      const result = await service.getAuditLogs(page, limit);
      return ResponseWrapper.success(res, result, 'Audit logs fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
