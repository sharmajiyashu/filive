import { Router, Response } from 'express';
import Container from 'typedi';
import { AgencyService } from '../../../services/admin/AgencyService';
import { CloudinaryService } from '../../../services/common/CloudinaryService';
import { MediaService } from '../../../services/common/MediaService';
import { MediaType } from '../../../constants/enum';
import { ResponseWrapper } from '../../responseWrapper';
import upload from '../../middleware/upload';

export default (router: Router) => {
  const agencyRouter = Router();
  const agencyService = Container.get(AgencyService);
  const cloudinaryService = Container.get(CloudinaryService);
  const mediaService = Container.get(MediaService);

  router.use('/agencies', agencyRouter);

  /**
   * @swagger
   * /admin/agencies/stats:
   *   get:
   *     summary: Get agency dashboard stats
   *     tags: [Admin - Agencies]
   */
  agencyRouter.get('/stats', async (_req: any, res: Response) => {
    try {
      const stats = await agencyService.getStats();
      return ResponseWrapper.success(res, stats, 'Agency stats fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/agencies:
   *   get:
   *     summary: Get all agencies
   *     tags: [Admin - Agencies]
   */
  agencyRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const status = req.query.status?.toString() || 'all';
      const search = req.query.search?.toString() || '';

      const result = await agencyService.getAgencies({ page, limit }, { status, search });
      return ResponseWrapper.success(res, result, 'Agencies fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/agencies:
   *   post:
   *     summary: Create agency (admin)
   *     tags: [Admin - Agencies]
   */
  agencyRouter.post('/', upload.single('logo'), async (req: any, res: Response) => {
    try {
      let logoId: string | undefined;

      if (req.file) {
        const uploadResults = await cloudinaryService.uploadMedia(MediaType.image, [req.file], 'agencies');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          logoId = media._id.toString();
        }
      }

      const agency = await agencyService.createAgency({
        creatorId: req.body.creatorId,
        bdId: req.body.bdId || undefined,
        name: req.body.name,
        email: req.body.email,
        mobile: req.body.mobile,
        commissionRate: req.body.commissionRate != null ? Number(req.body.commissionRate) : undefined,
        countryId: req.body.countryId,
        description: req.body.description,
        logoId,
      });

      return ResponseWrapper.success(res, agency, 'Agency created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/agencies/{id}:
   *   get:
   *     summary: Get agency details
   *     tags: [Admin - Agencies]
   */
  agencyRouter.get('/:id', async (req: any, res: Response) => {
    try {
      const agency = await agencyService.getAgencyDetails(req.params.id);
      return ResponseWrapper.success(res, agency, 'Agency details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/agencies/{id}:
   *   put:
   *     summary: Update agency (admin)
   *     tags: [Admin - Agencies]
   */
  agencyRouter.put('/:id', upload.single('logo'), async (req: any, res: Response) => {
    try {
      let logoId: string | undefined;

      if (req.file) {
        const uploadResults = await cloudinaryService.uploadMedia(MediaType.image, [req.file], 'agencies');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          logoId = media._id.toString();
        }
      }

      const agency = await agencyService.updateAgency(req.params.id, {
        name: req.body.name,
        email: req.body.email,
        mobile: req.body.mobile,
        commissionRate: req.body.commissionRate != null ? Number(req.body.commissionRate) : undefined,
        countryId: req.body.countryId,
        description: req.body.description,
        logoId,
      });

      return ResponseWrapper.success(res, agency, 'Agency updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/agencies/{id}/status:
   *   put:
   *     summary: Update agency status
   *     tags: [Admin - Agencies]
   */
  agencyRouter.put('/:id/status', async (req: any, res: Response) => {
    try {
      const { status } = req.body;

      if (!['approved', 'rejected'].includes(status)) {
        throw new Error('Status must be approved or rejected');
      }

      const agency = await agencyService.updateAgencyStatus(req.params.id, status);
      return ResponseWrapper.success(res, agency, `Agency status updated to ${status}`);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/agencies/{id}/hosts:
   *   get:
   *     summary: List agency hosts
   *     tags: [Admin - Agencies]
   */
  agencyRouter.get('/:id/hosts', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');
      const status = req.query.status?.toString() || 'all';

      const result = await agencyService.getAgencyHosts(req.params.id, { page, limit }, status);
      return ResponseWrapper.success(res, result, 'Agency hosts fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/agencies/{id}/hosts/{hostId}/status:
   *   put:
   *     summary: Update agency host status
   *     tags: [Admin - Agencies]
   */
  agencyRouter.put('/:id/hosts/:hostId/status', async (req: any, res: Response) => {
    try {
      const status = String(req.body.status || '').toUpperCase();
      if (!['ACCEPTED', 'SUSPENDED', 'REJECTED', 'PENDING'].includes(status)) {
        throw new Error('Status must be ACCEPTED, SUSPENDED, REJECTED, or PENDING');
      }

      const host = await agencyService.updateHostStatus(
        req.params.id,
        req.params.hostId,
        status as 'ACCEPTED' | 'SUSPENDED' | 'REJECTED' | 'PENDING'
      );
      return ResponseWrapper.success(res, host, 'Host status updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/agencies/{id}/transactions:
   *   get:
   *     summary: Get agency commission transactions
   *     tags: [Admin - Agencies]
   */
  agencyRouter.get('/:id/transactions', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');
      const type = req.query.type?.toString();
      const status = req.query.status?.toString();

      const result = await agencyService.getTransactions(req.params.id, page, limit, { type, status });
      return ResponseWrapper.success(res, result, 'Agency transactions fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/agencies/{id}/adjust-coins:
   *   put:
   *     summary: Adjust coins for agency owner
   *     tags: [Admin - Agencies]
   */
  agencyRouter.put('/:id/adjust-coins', async (req: any, res: Response) => {
    try {
      const amount = Number(req.body.amount);
      if (!Number.isFinite(amount) || amount === 0) {
        throw new Error('Amount must be a non-zero number');
      }

      const result = await agencyService.adjustCoins(req.params.id, amount, req.body.description);
      return ResponseWrapper.success(res, result, 'Agency coins adjusted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/agencies/{id}/send-notification:
   *   post:
   *     summary: Send notification to agency owner
   *     tags: [Admin - Agencies]
   */
  agencyRouter.post('/:id/send-notification', upload.single('image'), async (req: any, res: Response) => {
    try {
      let imageUrl: string | undefined;

      if (req.file) {
        const uploadResults = await cloudinaryService.uploadMedia(MediaType.image, [req.file], 'agency-notifications');
        if (uploadResults.length > 0) {
          imageUrl = uploadResults[0].url;
        }
      }

      const result = await agencyService.sendNotification(req.params.id, {
        title: req.body.title,
        message: req.body.message,
        imageUrl,
      });
      return ResponseWrapper.success(res, result, 'Notification sent successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
