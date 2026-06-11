import { Router, Response } from 'express';
import Container from 'typedi';
import { AdminAgencyCommissionService } from '../../../services/admin/AgencyCommissionService';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const commissionRouter = Router();
  const commissionService = Container.get(AdminAgencyCommissionService);

  router.use('/agency-commission', commissionRouter);

  commissionRouter.get('/slabs', async (req: any, res: Response) => {
    try {
      const slabs = await commissionService.getSlabs();
      return ResponseWrapper.success(res, slabs, 'Commission slabs fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.post('/slabs', async (req: any, res: Response) => {
    try {
      const slab = await commissionService.createSlab(req.body);
      return ResponseWrapper.success(res, slab, 'Commission slab created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.put('/slabs/:id', async (req: any, res: Response) => {
    try {
      const slab = await commissionService.updateSlab(req.params.id, req.body);
      return ResponseWrapper.success(res, slab, 'Commission slab updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.delete('/slabs/:id', async (req: any, res: Response) => {
    try {
      const slab = await commissionService.deleteSlab(req.params.id);
      return ResponseWrapper.success(res, slab, 'Commission slab deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.get('/settings', async (req: any, res: Response) => {
    try {
      const settings = await commissionService.getCommissionSettings();
      return ResponseWrapper.success(res, settings, 'Commission settings fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.put('/settings', async (req: any, res: Response) => {
    try {
      const settings = await commissionService.updateCommissionSettings(req.body);
      return ResponseWrapper.success(res, settings, 'Commission settings updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.put('/agencies/:agencyId/rate', async (req: any, res: Response) => {
    try {
      const { commissionRate, useAgencyCommissionRate } = req.body;
      const agency = await commissionService.setAgencyCommissionRate(
        req.params.agencyId,
        Number(commissionRate),
        useAgencyCommissionRate !== false
      );
      return ResponseWrapper.success(res, agency, 'Agency commission rate updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.put('/agencies/:agencyId/hold', async (req: any, res: Response) => {
    try {
      const { hold } = req.body;
      const agency = await commissionService.holdCommission(req.params.agencyId, hold !== false);
      return ResponseWrapper.success(res, agency, hold !== false ? 'Commission held' : 'Commission hold released');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.put('/agencies/:agencyId/freeze', async (req: any, res: Response) => {
    try {
      const { freeze } = req.body;
      const agency = await commissionService.freezeAgency(req.params.agencyId, freeze !== false);
      return ResponseWrapper.success(res, agency, freeze !== false ? 'Agency frozen' : 'Agency unfrozen');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.post('/settle', async (req: any, res: Response) => {
    try {
      const { agencyId } = req.body;
      const result = await commissionService.runManualSettlement(agencyId);
      return ResponseWrapper.success(res, result, 'Settlement processed');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.get('/agencies/:agencyId/logs', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');
      const type = req.query.type?.toString();
      const status = req.query.status?.toString();
      const result = await commissionService.getCommissionLogs(req.params.agencyId, page, limit, { type, status });
      return ResponseWrapper.success(res, result, 'Commission logs fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  commissionRouter.get('/agencies/:agencyId/settlements', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');
      const result = await commissionService.getSettlementHistory(req.params.agencyId, page, limit);
      return ResponseWrapper.success(res, result, 'Settlement history fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
