import { Router, Response } from 'express';
import Container from 'typedi';
import { PayoutRequestService } from '../../../services/admin/PayoutRequestService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const payoutRequestService = Container.get(PayoutRequestService);
  const payoutRequestRouter = Router();

  router.use('/payout-request', adminAuthMiddleware, payoutRequestRouter);

  /**
   * GET Payout Requests (Admin List)
   */
  payoutRequestRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 20;
      const status = req.query.status ? req.query.status.toString() : undefined;
      const search = req.query.search ? req.query.search.toString() : undefined;

      const result = await payoutRequestService.getAdminPayoutRequests(page, limit, status, search);
      return ResponseWrapper.success(res, result, 'Payout requests fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * UPDATE Payout Request Status (Approve/Reject)
   */
  payoutRequestRouter.put('/:id/status', async (req: any, res: Response) => {
    try {
      const adminId = req.user?.id || req.user?._id;
      const { status, adminNote, transactionId } = req.body;

      if (!status || !['approved', 'rejected', 'processing'].includes(status)) {
        throw new Error("Invalid status. Must be 'approved', 'rejected', or 'processing'");
      }

      const result = await payoutRequestService.updatePayoutRequestStatus(req.params.id, adminId, {
        status,
        adminNote,
        transactionId,
      });

      return ResponseWrapper.success(res, result, `Payout request status updated to ${status}`);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
