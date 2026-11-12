import { Router, Response } from 'express';
import Container from 'typedi';
import { AdminAgencyCommissionService } from '../../../services/admin/AgencyCommissionService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const commissionRouter = Router();
  const commissionService = Container.get(AdminAgencyCommissionService);

  router.use('/agency-commission', adminAuthMiddleware, commissionRouter);

  // 1. Dashboard Overview
  commissionRouter.get('/dashboard', async (_req: any, res: Response) => {
    try {
      const data = await commissionService.getDashboardOverview();
      return ResponseWrapper.success(res, data, 'Agency commission dashboard data fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  // 2. Slabs
  commissionRouter.get('/slabs', async (_req: any, res: Response) => {
    try {
      const slabs = await commissionService.getSlabs();
      return ResponseWrapper.success(res, slabs, 'Commission slabs fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.post('/slabs', async (req: any, res: Response) => {
    try {
      const slab = await commissionService.createSlab(req.body, req.admin);
      return ResponseWrapper.success(res, slab, 'Commission slab created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.put('/slabs/:id', async (req: any, res: Response) => {
    try {
      const slab = await commissionService.updateSlab(req.params.id, req.body, req.admin);
      return ResponseWrapper.success(res, slab, 'Commission slab updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.delete('/slabs/:id', async (req: any, res: Response) => {
    try {
      const slab = await commissionService.deleteSlab(req.params.id, req.admin);
      return ResponseWrapper.success(res, slab, 'Commission slab deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  // 3. Settings (Weekly period & Settlement)
  commissionRouter.get('/settings', async (_req: any, res: Response) => {
    try {
      const settings = await commissionService.getPeriodAndSettlementSettings();
      return ResponseWrapper.success(res, settings, 'Commission settings fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.put('/settings', async (req: any, res: Response) => {
    try {
      const settings = await commissionService.updatePeriodAndSettlementSettings(req.body, req.admin);
      return ResponseWrapper.success(res, settings, 'Commission settings updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  // 4. Agency Commission List (Current Period)
  commissionRouter.get('/agencies', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');
      const search = req.query.search?.toString();
      const status = req.query.status?.toString();

      const result = await commissionService.getAgencyCommissionList({ page, limit, search, status });
      return ResponseWrapper.success(res, result, 'Agencies commission list fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  // 5. Agency Detail (Drill-Down with Host-Wise Breakdown & Owner Self ID)
  commissionRouter.get('/agencies/:agencyId', async (req: any, res: Response) => {
    try {
      const start = req.query.cycleStart ? new Date(req.query.cycleStart) : undefined;
      const end = req.query.cycleEnd ? new Date(req.query.cycleEnd) : undefined;
      const detail = await commissionService.getAgencyDetail(req.params.agencyId, start, end);
      return ResponseWrapper.success(res, detail, 'Agency detail fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  // 6. Settlement Batch Management (Preview, Approve, Settle, Retry)
  commissionRouter.get('/settlements/preview', async (req: any, res: Response) => {
    try {
      const start = req.query.cycleStart ? new Date(req.query.cycleStart) : undefined;
      const end = req.query.cycleEnd ? new Date(req.query.cycleEnd) : undefined;
      const preview = await commissionService.generateSettlementPreview(start, end);
      return ResponseWrapper.success(res, preview, 'Settlement preview generated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.post('/settlements/save', async (req: any, res: Response) => {
    try {
      const batch = await commissionService.saveOrUpdateBatch(req.body, req.admin);
      return ResponseWrapper.success(res, batch, 'Settlement batch saved successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.post('/settlements/approve', async (req: any, res: Response) => {
    try {
      const { batchId } = req.body;
      if (!batchId) throw new Error('batchId is required');
      const batch = await commissionService.approveBatch(batchId, req.admin);
      return ResponseWrapper.success(res, batch, 'Settlement batch approved successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.post('/settlements/execute', async (req: any, res: Response) => {
    try {
      const { batchId } = req.body;
      if (!batchId) throw new Error('batchId is required');
      const result = await commissionService.executeSettlement(batchId, req.admin);
      return ResponseWrapper.success(res, result, 'Settlement executed successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.post('/settlements/retry', async (req: any, res: Response) => {
    try {
      const { batchId, agencyId } = req.body;
      if (!batchId || !agencyId) throw new Error('batchId and agencyId are required');
      const result = await commissionService.retrySettlementItem(batchId, agencyId, req.admin);
      return ResponseWrapper.success(res, result, result.message);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  // 7. Manual Adjustments
  commissionRouter.post('/adjustments', async (req: any, res: Response) => {
    try {
      const adj = await commissionService.addManualAdjustment(req.body, req.admin);
      return ResponseWrapper.success(res, adj, 'Manual adjustment recorded successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  // 8. Audit Logs
  commissionRouter.get('/audit-logs', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');
      const logs = await commissionService.getAuditLogs(page, limit);
      return ResponseWrapper.success(res, logs, 'Audit logs fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
