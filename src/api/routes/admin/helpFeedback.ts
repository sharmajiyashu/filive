import { Router, Response } from 'express';
import Feedback from '../../../models/Feedback';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const adminFeedbackRouter = Router();

  router.use('/help-feedback', adminFeedbackRouter);

  /**
   * @swagger
   * /admin/help-feedback:
   *   get:
   *     summary: Get all help & feedback tickets (Admin)
   *     tags: [Admin - Help & Feedback]
   *     parameters:
   *       - in: query
   *         name: status
   *         schema:
   *           type: string
   *           enum: [pending, completed, all]
   *         description: Status to filter tickets by (default to all)
   *     responses:
   *       200:
   *         description: Tickets fetched successfully
   */
  adminFeedbackRouter.get('/', async (req: any, res: Response) => {
    try {
      const statusQuery = req.query.status?.toString();
      const filter: any = {};

      if (statusQuery && statusQuery !== 'all') {
        filter.status = statusQuery;
      }

      const tickets = await Feedback.find(filter)
        .populate({
          path: 'userId',
          select: 'name email profileImage bio country',
          populate: { path: 'profileImage' }
        })
        .populate('images')
        .sort({ createdAt: -1 });

      return ResponseWrapper.success(res, tickets, 'Help & Feedback tickets fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/help-feedback/{id}/status:
   *   patch:
   *     summary: Update the status of a feedback ticket
   *     tags: [Admin - Help & Feedback]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               status:
   *                 type: string
   *                 enum: [pending, completed]
   *     responses:
   *       200:
   *         description: Status updated successfully
   */
  adminFeedbackRouter.patch('/:id/status', async (req: any, res: Response) => {
    try {
      const { status } = req.body;
      if (!status || !['pending', 'completed'].includes(status)) {
        throw new Error('Valid status (pending or completed) is required');
      }

      const ticket = await Feedback.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      ).populate({
        path: 'userId',
        select: 'name email profileImage bio country',
        populate: { path: 'profileImage' }
      }).populate('images');

      if (!ticket) {
        throw new Error('Feedback ticket not found');
      }

      return ResponseWrapper.success(res, ticket, 'Ticket status updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
