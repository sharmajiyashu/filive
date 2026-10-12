import { Router, Response } from 'express';
import TeamApplication from '../../../models/TeamApplication';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const adminTeamRouter = Router();

  router.use('/team-applications', adminAuthMiddleware, adminTeamRouter);

  /**
   * GET /admin/team-applications
   * Get team/agency applications with optional filters and stats
   */
  adminTeamRouter.get('/', async (req: any, res: Response) => {
    try {
      const { status, inquiryType, search } = req.query;
      const page = Math.max(1, parseInt(req.query.page?.toString() || '1', 10));
      const limit = Math.max(1, Math.min(100, parseInt(req.query.limit?.toString() || '20', 10)));
      const skip = (page - 1) * limit;

      const filter: any = {};

      if (status && status !== 'all') {
        filter.status = status;
      }

      if (inquiryType && inquiryType !== 'all') {
        filter.inquiryType = inquiryType;
      }

      if (search && String(search).trim()) {
        const query = String(search).trim();
        filter.$or = [
          { name: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
          { message: { $regex: query, $options: 'i' } },
          { audienceSize: { $regex: query, $options: 'i' } },
        ];
      }

      const [applications, total, pendingCount, contactedCount, approvedCount, rejectedCount] =
        await Promise.all([
          TeamApplication.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
          TeamApplication.countDocuments(filter),
          TeamApplication.countDocuments({ status: 'pending' }),
          TeamApplication.countDocuments({ status: 'contacted' }),
          TeamApplication.countDocuments({ status: 'approved' }),
          TeamApplication.countDocuments({ status: 'rejected' }),
        ]);

      return ResponseWrapper.success(
        res,
        {
          applications,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
          stats: {
            total: pendingCount + contactedCount + approvedCount + rejectedCount,
            pending: pendingCount,
            contacted: contactedCount,
            approved: approvedCount,
            rejected: rejectedCount,
          },
        },
        'Team applications fetched successfully'
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * PUT /admin/team-applications/:id
   * Update application status and admin notes
   */
  adminTeamRouter.put('/:id', async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      const updateData: any = {};
      if (status) {
        const validStatuses = ['pending', 'contacted', 'approved', 'rejected'];
        if (!validStatuses.includes(status)) {
          return ResponseWrapper.error(res, new Error('Invalid status. Allowed: pending, contacted, approved, rejected'), 400);
        }
        updateData.status = status;
      }

      if (notes !== undefined) {
        updateData.notes = String(notes);
      }

      const updated = await TeamApplication.findByIdAndUpdate(id, { $set: updateData }, { new: true });
      if (!updated) {
        return ResponseWrapper.error(res, new Error('Application not found'), 404);
      }

      return ResponseWrapper.success(res, updated, 'Application updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * DELETE /admin/team-applications/:id
   * Delete an application
   */
  adminTeamRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const deleted = await TeamApplication.findByIdAndDelete(id);
      if (!deleted) {
        return ResponseWrapper.error(res, new Error('Application not found'), 404);
      }

      return ResponseWrapper.success(res, { id }, 'Application deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
