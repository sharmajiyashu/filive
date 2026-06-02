import { Router, Response } from 'express';
import Container from 'typedi';
import { ChatService } from '../../../services/app/ChatService';
import { ChatMessageService } from '../../../services/app/ChatMessageService';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const chatService = Container.get(ChatService);
  const chatMessageService = Container.get(ChatMessageService);
  const appRouter = Router();

  router.use('/chats', appRouter);

  /**
   * @swagger
   * /app/chats:
   *   get:
   *     summary: Get all chats for the authenticated user
   *     tags: [Chats]
   *     security:
   *       - bearerAuth: []
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
   *         name: filter
   *         schema:
   *           type: string
   *           enum: [online, frequent, follow]
   *     responses:
   *       200:
   *         description: List of user chats fetched successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     data:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: string
   *                           type:
   *                             type: string
   *                             enum: [private, group]
   *                           name:
   *                             type: string
   *                           mediaUrl:
   *                             type: string
   *                           role:
   *                             type: string
   *                           isMuted:
   *                             type: boolean
   *                           isPinned:
   *                             type: boolean
   *                           lastSeenAt:
   *                             type: string
   *                             format: date-time
   *                           archiveAt:
   *                             type: string
   *                             format: date-time
   *                           unreadCount:
   *                             type: integer
   *                           messageCount:
   *                             type: integer
   *                           isOnline:
   *                             type: boolean
   *                           isFollowed:
   *                             type: boolean
   *                           userId:
   *                             type: string
   *                           otherParticipant:
   *                             type: object
   *                           participants:
   *                             type: array
   *                             items:
   *                               type: object
   *                               properties:
   *                                 role:
   *                                   type: string
   *                                 isMuted:
   *                                   type: boolean
   *                                 isPinned:
   *                                   type: boolean
   *                                 lastSeenAt:
   *                                   type: string
   *                                   format: date-time
   *                                 archiveAt:
   *                                   type: string
   *                                   format: date-time
   *                                 joinedAt:
   *                                   type: string
   *                                   format: date-time
   *                                 userId:
   *                                   type: object
   *                                   properties:
   *                                     _id:
   *                                       type: string
   *                                     userId:
   *                                       type: integer
   *                                     name:
   *                                       type: string
   *                                     email:
   *                                       type: string
   *                                     profileImage:
   *                                       type: object
   *                                     userRole:
   *                                       type: string
   *                           updatedAt:
   *                             type: string
   *                             format: date-time
   */
  appRouter.get('/', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');
      const filter = req.query.filter as 'online' | 'frequent' | 'follow' | undefined;
      const result = await chatService.getUserChats(userId, page, limit, filter);
      return ResponseWrapper.success(res, result, 'Chats fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/chats:
   *   post:
   *     summary: Create a new chat (private or group)
   *     tags: [Chats]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - type
   *               - participants
   *             properties:
   *               type:
   *                 type: string
   *                 enum: [private, group]
   *               name:
   *                 type: string
   *               participants:
   *                 type: array
   *                 items:
   *                   type: string
   *               mediaId:
   *                 type: string
   *     responses:
   *       201:
   *         description: Chat created successfully
   */
  appRouter.post('/', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const chat = await chatService.createChat(userId, req.body);
      return ResponseWrapper.success(res, chat, 'Chat created successfully', 201);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/chats/personal:
   *   post:
   *     summary: Get or create a personal chat with another user
   *     tags: [Chats]
   *     security:
   *       - bearerAuth: []
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
   *         description: Chat retrieved or created successfully
   */
  appRouter.post('/personal', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const { targetUserId } = req.body;
      if (!targetUserId) {
        throw new Error('targetUserId is required');
      }
      const chat = await chatService.getOrCreateSingleChat(userId, targetUserId);
      return ResponseWrapper.success(res, chat, 'Chat retrieved or created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/chats/{chatId}/messages:
   *   get:
   *     summary: Get message history for a chat
   *     tags: [Chats]
   *     security:
   *       - bearerAuth: []
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
   *         description: Messages retrieved successfully
   */
  appRouter.get('/:chatId/messages', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const chatId = req.params.chatId;
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '50');
      const result = await chatMessageService.getConversation(userId, chatId, page, limit);
      return ResponseWrapper.success(res, result, 'Messages fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/chats/messages/{messageId}:
   *   delete:
   *     summary: Delete a message from a chat
   *     tags: [Chats]
   *     security:
   *       - bearerAuth: []
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
  appRouter.delete('/messages/:messageId', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const messageId = req.params.messageId;
      const result = await chatMessageService.deleteMessage(userId, messageId);
      return ResponseWrapper.success(res, result, 'Message deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/chats/{chatId}:
   *   get:
   *     summary: Get chat details with participants and block status
   *     tags: [Chats]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: chatId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Chat details fetched successfully
   *   delete:
   *     summary: Delete a chat
   *     tags: [Chats]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: chatId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Chat deleted successfully
   */
  appRouter.delete('/:chatId', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const chatId = req.params.chatId;
      const result = await chatService.deleteChat(userId, chatId);
      return ResponseWrapper.success(res, result, 'Chat deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  appRouter.get('/:chatId', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const chatId = req.params.chatId;
      const result = await chatService.getChatDetails(userId, chatId);
      return ResponseWrapper.success(res, result, 'Chat details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};

