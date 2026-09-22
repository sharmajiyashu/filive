import { Router, Response } from 'express';
import Container from 'typedi';
import { AdminSupportChatService } from '../../../services/admin/AdminSupportChatService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';
import upload from '../../middleware/upload';

export default (router: Router) => {
  const adminSupportChatService = Container.get(AdminSupportChatService);
  const supportChatRouter = Router();

  router.use('/support-chat', adminAuthMiddleware, supportChatRouter);

  /**
   * @swagger
   * /admin/support-chat/threads:
   *   get:
   *     summary: List all user support chat threads
   *     tags: [Admin - Support Chat]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Search by user name, email, numeric userId, or mobile
   *       - in: query
   *         name: filter
   *         schema:
   *           type: string
   *           enum: [all, unread]
   *     responses:
   *       200:
   *         description: Support chat threads retrieved successfully
   */
  supportChatRouter.get('/threads', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');
      const search = req.query.search?.toString();
      const filter = req.query.filter as 'unread' | 'all' | undefined;

      const result = await adminSupportChatService.getSupportThreads({
        page,
        limit,
        search,
        filter
      });
      return ResponseWrapper.success(res, result, 'Support chat threads fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/support-chat/stats:
   *   get:
   *     summary: Get overall support chat statistics
   *     tags: [Admin - Support Chat]
   *     responses:
   *       200:
   *         description: Support statistics fetched successfully
   */
  supportChatRouter.get('/stats', async (_req: any, res: Response) => {
    try {
      const result = await adminSupportChatService.getSupportStats();
      return ResponseWrapper.success(res, result, 'Support stats fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/support-chat/threads/{chatId}/messages:
   *   get:
   *     summary: Get conversation messages for a support chat thread
   *     tags: [Admin - Support Chat]
   *     parameters:
   *       - in: path
   *         name: chatId
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Conversation fetched successfully
   */
  supportChatRouter.get('/threads/:chatId/messages', async (req: any, res: Response) => {
    try {
      const chatId = req.params.chatId;
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '50');

      const result = await adminSupportChatService.getSupportConversation(chatId, page, limit);
      return ResponseWrapper.success(res, result, 'Conversation messages fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/support-chat/threads/{chatId}/messages:
   *   post:
   *     summary: Send a support message to user
   *     tags: [Admin - Support Chat]
   *     parameters:
   *       - in: path
   *         name: chatId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               text:
   *                 type: string
   *               replyToId:
   *                 type: string
   *               media:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *     responses:
   *       201:
   *         description: Support message sent successfully
   */
  supportChatRouter.post(
    '/threads/:chatId/messages',
    upload.array('media', 5),
    async (req: any, res: Response) => {
      try {
        const chatId = req.params.chatId;
        const { text, replyToId } = req.body;
        const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);

        const result = await adminSupportChatService.sendSupportMessage(
          chatId,
          { text, replyToId },
          files
        );
        return ResponseWrapper.success(res, result, 'Support message sent successfully', 201);
      } catch (error: any) {
        return ResponseWrapper.error(res, error);
      }
    }
  );

  /**
   * @swagger
   * /admin/support-chat/start:
   *   post:
   *     summary: Start or open a support chat with a registered user
   *     tags: [Admin - Support Chat]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - targetUserId
   *             properties:
   *               targetUserId:
   *                 type: string
   *     responses:
   *       200:
   *         description: Support chat initialized successfully
   */
  supportChatRouter.post('/start', async (req: any, res: Response) => {
    try {
      const { targetUserId } = req.body;
      if (!targetUserId) {
        throw new Error('targetUserId is required');
      }
      const result = await adminSupportChatService.startSupportChat(targetUserId);
      return ResponseWrapper.success(res, result, 'Support chat opened successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/support-chat/threads/{chatId}/read:
   *   patch:
   *     summary: Mark a support chat as read
   *     tags: [Admin - Support Chat]
   *     parameters:
   *       - in: path
   *         name: chatId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Marked as read
   */
  supportChatRouter.patch('/threads/:chatId/read', async (req: any, res: Response) => {
    try {
      const chatId = req.params.chatId;
      const result = await adminSupportChatService.markSupportChatRead(chatId);
      return ResponseWrapper.success(res, result, 'Chat marked as read');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/support-chat/messages/{messageId}:
   *   delete:
   *     summary: Delete a support message
   *     tags: [Admin - Support Chat]
   *     parameters:
   *       - in: path
   *         name: messageId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Message deleted successfully
   */
  supportChatRouter.delete('/messages/:messageId', async (req: any, res: Response) => {
    try {
      const messageId = req.params.messageId;
      const result = await adminSupportChatService.deleteSupportMessage(messageId);
      return ResponseWrapper.success(res, result, 'Message deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
