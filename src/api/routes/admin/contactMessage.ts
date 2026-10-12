import { Router, Request, Response } from 'express';
import ContactMessage from '../../../models/ContactMessage';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const contactRouter = Router();

  router.use('/contact-messages', adminAuthMiddleware, contactRouter);

  /**
   * GET /v1/api/admin/contact-messages
   * List contact messages with search, status filter, pagination, and status counters
   */
  contactRouter.get('/', async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 15));
      const skip = (page - 1) * limit;

      const { status, search } = req.query;
      const query: any = {};

      if (status && status !== 'all') {
        query.status = status;
      }

      if (search && String(search).trim()) {
        const regex = new RegExp(String(search).trim(), 'i');
        query.$or = [
          { name: regex },
          { email: regex },
          { subject: regex },
          { message: regex },
        ];
      }

      const [messages, total, totalAll, pendingCount, contactedCount, resolvedCount, spamCount] =
        await Promise.all([
          ContactMessage.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
          ContactMessage.countDocuments(query),
          ContactMessage.countDocuments(),
          ContactMessage.countDocuments({ status: 'pending' }),
          ContactMessage.countDocuments({ status: 'contacted' }),
          ContactMessage.countDocuments({ status: 'resolved' }),
          ContactMessage.countDocuments({ status: 'spam' }),
        ]);

      return ResponseWrapper.success(
        res,
        {
          messages,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
          stats: {
            all: totalAll,
            pending: pendingCount,
            contacted: contactedCount,
            resolved: resolvedCount,
            spam: spamCount,
          },
        },
        'Contact messages fetched successfully'
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * PUT /v1/api/admin/contact-messages/:id
   * Update message status and/or admin notes
   */
  contactRouter.put('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      const updateData: Record<string, any> = {};

      if (status !== undefined) {
        const validStatuses = ['pending', 'contacted', 'resolved', 'spam'];
        if (!validStatuses.includes(status)) {
          return ResponseWrapper.error(
            res,
            new Error("Invalid status. Allowed: 'pending', 'contacted', 'resolved', 'spam'"),
            400
          );
        }
        updateData.status = status;
      }

      if (notes !== undefined) {
        updateData.notes = String(notes).trim();
      }

      const updated = await ContactMessage.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true }
      );

      if (!updated) {
        return ResponseWrapper.error(res, new Error('Contact message not found'), 404);
      }

      return ResponseWrapper.success(res, { message: updated }, 'Contact message updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * DELETE /v1/api/admin/contact-messages/:id
   * Delete contact message
   */
  contactRouter.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const deleted = await ContactMessage.findByIdAndDelete(id);

      if (!deleted) {
        return ResponseWrapper.error(res, new Error('Contact message not found'), 404);
      }

      return ResponseWrapper.success(res, { deleted: true }, 'Contact message deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
