import { Router, Response } from 'express';
import Container from 'typedi';
import { AgencyService } from '../../../services/admin/AgencyService';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const agencyRouter = Router();
  const agencyService = Container.get(AgencyService);

  router.use('/agencies', agencyRouter);

  /**
   * @swagger
   * /admin/agencies:
   *   get:
   *     summary: Get all agencies
   *     tags: [Admin - Agencies]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer }
   *       - in: query
   *         name: limit
   *         schema: { type: integer }
   *       - in: query
   *         name: status
   *         schema: { type: string, enum: [pending, approved, rejected, all] }
   *       - in: query
   *         name: search
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Agencies fetched successfully
   */
  agencyRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const status = req.query.status?.toString() || 'pending';
      const search = req.query.search?.toString() || '';

      const result = await agencyService.getAgencies({ page, limit }, { status, search });
      return ResponseWrapper.success(res, result, 'Agencies fetched successfully');
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
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Agency details fetched successfully
   */
  agencyRouter.get('/:id', async (req: any, res: Response) => {
    try {
      const agencyId = req.params.id;
      const agency = await agencyService.getAgencyDetails(agencyId);
      return ResponseWrapper.success(res, agency, 'Agency details fetched successfully');
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
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               status:
   *                 type: string
   *                 enum: [approved, rejected]
   *     responses:
   *       200:
   *         description: Agency status updated successfully
   */
  agencyRouter.put('/:id/status', async (req: any, res: Response) => {
    try {
      const agencyId = req.params.id;
      const { status } = req.body;

      if (!['approved', 'rejected'].includes(status)) {
        throw new Error('Status must be approved or rejected');
      }

      const agency = await agencyService.updateAgencyStatus(agencyId, status);
      return ResponseWrapper.success(res, agency, `Agency status updated to ${status}`);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
