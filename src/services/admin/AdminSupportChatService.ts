import { Service, Inject, Container } from 'typedi';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import Chat from '../../models/Chat';
import Message from '../../models/Message';
import User from '../../models/User';
import AppLogger from '../../api/loaders/logger';
import { CloudinaryService } from '../common/CloudinaryService';
import { MediaService } from '../common/MediaService';
import { FirebasePushService } from '../common/FirebasePushService';
import { MediaType } from '../../constants/enum';
import { resolveMediaType } from '../../utils/mediaType';
import { ChatService } from '../app/ChatService';

export interface ISupportThreadFilters {
  page?: number;
  limit?: number;
  search?: string;
  filter?: 'unread' | 'all';
}

@Service()
export class AdminSupportChatService {
  constructor(
    @Inject() private cloudinaryService: CloudinaryService,
    @Inject() private mediaService: MediaService,
    @Inject() private pushService: FirebasePushService,
    @Inject() private chatService: ChatService
  ) { }

  private getSocketIo(): Server | null {
    try {
      return Container.get('socket') as Server;
    } catch {
      return null;
    }
  }

  public async resolveSupportUser(): Promise<any> {
    return this.chatService.resolveSupportUser();
  }

  /**
   * Get all support chat threads (all customer users chatting with support)
   */
  public async getSupportThreads(options: ISupportThreadFilters = {}) {
    const page = Math.max(1, Number(options.page || 1));
    const limit = Math.max(1, Number(options.limit || 20));
    const skip = (page - 1) * limit;

    const supportUser = await this.resolveSupportUser();
    const supportUserId = supportUser._id;
    const supportUserIdStr = supportUserId.toString();

    // Find all chats containing the support user
    const chats = await Chat.find({
      'participants.userId': supportUserId,
      type: 'private'
    })
      .populate({
        path: 'participants.userId',
        select: 'name email profileImage userRole coins gender dob location country bio userId mobile lastLoginAt isVerified isBlocked',
        populate: { path: 'profileImage' }
      })
      .populate('mediaId')
      .lean();

    const io = this.getSocketIo();

    // Process threads with unread counts and last message
    let threads = await Promise.all(
      chats.map(async (chat: any) => {
        // Find the customer participant
        const customerParticipant = chat.participants?.find((p: any) => {
          const pId = p.userId?._id ? p.userId._id.toString() : p.userId?.toString();
          return pId && pId !== supportUserIdStr;
        });

        const customerUser = customerParticipant?.userId || null;
        const customerUserIdStr = customerUser?._id ? customerUser._id.toString() : '';

        // Fetch last active message
        const lastMessage = await Message.findOne({
          chatId: chat._id,
          deletedAt: { $exists: false }
        })
          .sort({ createdAt: -1 })
          .populate({
            path: 'senderId',
            select: 'name email profileImage userRole userId',
            populate: { path: 'profileImage' }
          })
          .populate('medias')
          .lean();

        // Unread count: messages sent by customer that haven't been seen by supportUser
        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          senderId: { $ne: supportUserId },
          'seenBy.userId': { $ne: supportUserId },
          deletedAt: { $exists: false }
        });

        const totalMessageCount = await Message.countDocuments({
          chatId: chat._id,
          deletedAt: { $exists: false }
        });

        // Online status calculation
        let isOnline = false;
        let userStatus: 'online' | 'offline' = 'offline';

        if (customerUser && customerUserIdStr) {
          const socketOnline = io
            ? (io.sockets?.adapter?.rooms?.get(`user_${customerUserIdStr}`)?.size || 0) > 0
            : false;
          const recentLogin = customerUser.lastLoginAt
            ? new Date(customerUser.lastLoginAt).getTime() > Date.now() - 15 * 60 * 1000
            : false;
          isOnline = socketOnline || recentLogin;
          userStatus = isOnline ? 'online' : 'offline';
        }

        const customerDetails = customerUser
          ? {
            ...customerUser,
            id: customerUserIdStr,
            isOnline,
            status: userStatus,
            userStatus
          }
          : null;

        return {
          id: chat._id.toString(),
          chatId: chat._id.toString(),
          user: customerDetails,
          lastMessage: lastMessage
            ? {
              id: (lastMessage as any)._id?.toString(),
              text: (lastMessage as any).text || '',
              type: (lastMessage as any).type || 'text',
              senderId: (lastMessage as any).senderId?._id?.toString() || (lastMessage as any).senderId?.toString(),
              senderName: (lastMessage as any).senderId?.name || 'User',
              isFromSupport: (lastMessage as any).senderId?._id?.toString() === supportUserIdStr,
              medias: (lastMessage as any).medias || [],
              createdAt: (lastMessage as any).createdAt
            }
            : null,
          unreadCount,
          totalMessages: totalMessageCount,
          isOnline,
          updatedAt: (lastMessage as any)?.createdAt || chat.updatedAt || chat.createdAt,
          createdAt: chat.createdAt
        };
      })
    );

    // Filter out threads without a valid customer user
    threads = threads.filter(t => t.user != null);

    // Search filter
    if (options.search && options.search.trim() !== '') {
      const q = options.search.trim().toLowerCase();
      const numQ = Number(q);
      const isNum = !isNaN(numQ);

      threads = threads.filter(t => {
        const u = t.user;
        if (!u) return false;
        const nameMatch = u.name && u.name.toLowerCase().includes(q);
        const emailMatch = u.email && u.email.toLowerCase().includes(q);
        const mobileMatch = u.mobile && u.mobile.toLowerCase().includes(q);
        const idMatch = isNum && u.userId === numQ;
        const strIdMatch = u.userId !== undefined && String(u.userId).includes(q);
        return nameMatch || emailMatch || mobileMatch || idMatch || strIdMatch;
      });
    }

    // Filter by unread
    if (options.filter === 'unread') {
      threads = threads.filter(t => t.unreadCount > 0);
    }

    // Sort by latest message date descending
    threads.sort((a, b) => {
      const timeA = new Date(a.updatedAt).getTime();
      const timeB = new Date(b.updatedAt).getTime();
      return timeB - timeA;
    });

    const total = threads.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedThreads = threads.slice(skip, skip + limit);

    const totalUnreadThreads = threads.filter(t => t.unreadCount > 0).length;
    const totalUnreadMessages = threads.reduce((sum, t) => sum + (t.unreadCount || 0), 0);

    return {
      threads: paginatedThreads,
      pagination: {
        page,
        limit,
        total,
        totalPages
      },
      summary: {
        totalThreads: total,
        unreadThreads: totalUnreadThreads,
        unreadMessages: totalUnreadMessages
      }
    };
  }

  /**
   * Get messages for a specific support chat conversation and mark as read
   */
  public async getSupportConversation(chatId: string, page: number = 1, limit: number = 50) {
    const supportUser = await this.resolveSupportUser();
    const supportUserId = supportUser._id;
    const supportUserIdStr = supportUserId.toString();

    const chat = await Chat.findOne({
      _id: new mongoose.Types.ObjectId(chatId),
      'participants.userId': supportUserId
    }).populate({
      path: 'participants.userId',
      select: 'name email profileImage userRole coins gender dob location country bio userId mobile lastLoginAt isVerified isBlocked',
      populate: { path: 'profileImage' }
    });

    if (!chat) {
      throw new Error('Support chat thread not found');
    }

    // Find customer user
    const customerParticipant = chat.participants?.find((p: any) => {
      const pId = p.userId?._id ? p.userId._id.toString() : p.userId?.toString();
      return pId && pId !== supportUserIdStr;
    });
    const customerUser = (customerParticipant?.userId as any) || null;
    const customerUserIdStr = customerUser?._id ? customerUser._id.toString() : '';

    const skip = (page - 1) * limit;

    // Mark all unread customer messages as seen by support
    await Message.updateMany(
      {
        chatId: chat._id,
        senderId: { $ne: supportUserId },
        'seenBy.userId': { $ne: supportUserId },
        deletedAt: { $exists: false }
      },
      {
        $addToSet: {
          seenBy: {
            userId: supportUserId,
            seenAt: new Date()
          }
        }
      }
    );

    // Notify sockets about read status
    const io = this.getSocketIo();
    if (io) {
      io.to(`chat_${chatId}`).emit('chat_read_update', {
        chatId,
        userId: supportUserIdStr,
        readBySupport: true
      });
      if (customerUserIdStr) {
        io.to(`user_${customerUserIdStr}`).emit('chat_read_update', {
          chatId,
          userId: supportUserIdStr,
          readBySupport: true
        });
      }
    }

    const [rawMessages, total] = await Promise.all([
      Message.find({
        chatId: chat._id,
        deletedAt: { $exists: false }
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'senderId',
          select: 'name email profileImage userRole userId isVerified',
          populate: { path: 'profileImage' }
        })
        .populate('medias')
        .populate({
          path: 'replyToId',
          populate: [
            { path: 'senderId', select: 'name email profileImage userRole userId' },
            { path: 'medias' }
          ]
        })
        .lean(),
      Message.countDocuments({
        chatId: chat._id,
        deletedAt: { $exists: false }
      })
    ]);

    const formattedMessages = rawMessages.reverse().map((msg: any) => {
      const senderIdStr = msg.senderId?._id ? msg.senderId._id.toString() : msg.senderId?.toString();
      const isFromSupport = senderIdStr === supportUserIdStr;

      return {
        id: msg._id.toString(),
        _id: msg._id.toString(),
        chatId: msg.chatId.toString(),
        senderId: msg.senderId,
        senderIdStr,
        isFromSupport,
        type: msg.type,
        text: msg.text || '',
        medias: msg.medias || [],
        replyToId: msg.replyToId || null,
        reactions: msg.reactions || [],
        seenBy: msg.seenBy || [],
        isSeen: (msg.seenBy && msg.seenBy.length > 0) || false,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt
      };
    });

    let isCustomerOnline = false;
    if (io && customerUserIdStr) {
      isCustomerOnline = (io.sockets?.adapter?.rooms?.get(`user_${customerUserIdStr}`)?.size || 0) > 0;
    }

    return {
      chat: {
        id: chat._id.toString(),
        customer: customerUser
          ? {
            ...customerUser.toObject ? customerUser.toObject() : customerUser,
            id: customerUserIdStr,
            isOnline: isCustomerOnline
          }
          : null,
        supportUser: {
          id: supportUserIdStr,
          name: supportUser.name || 'Contact Support',
          email: supportUser.email
        },
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt
      },
      messages: formattedMessages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Send a support message from the official Support User to a customer
   */
  public async sendSupportMessage(
    chatId: string,
    data: { text?: string; replyToId?: string },
    files?: Express.Multer.File[]
  ) {
    const supportUser = await this.resolveSupportUser();
    const supportUserId = supportUser._id;
    const supportUserIdStr = supportUserId.toString();

    const chat = await Chat.findOne({
      _id: new mongoose.Types.ObjectId(chatId),
      'participants.userId': supportUserId
    }).populate('participants.userId');

    if (!chat) {
      throw new Error('Support chat thread not found');
    }

    const customerParticipant = chat.participants?.find((p: any) => {
      const pId = p.userId?._id ? p.userId._id.toString() : p.userId?.toString();
      return pId && pId !== supportUserIdStr;
    });

    const customerUserIdStr = customerParticipant?.userId?._id
      ? customerParticipant.userId._id.toString()
      : customerParticipant?.userId?.toString() || '';

    // Handle file attachments if any
    const mediaIds: mongoose.Types.ObjectId[] = [];
    let messageType: 'text' | 'image' | 'video' | 'file' = 'text';

    if (files && files.length > 0) {
      for (const file of files) {
        const detectedType = resolveMediaType(file);
        const folder = 'chat/support';
        const uploadResults = await this.cloudinaryService.uploadMedia(detectedType, [file], folder);
        if (uploadResults && uploadResults.length > 0) {
          const media = await this.mediaService.createMedia({ ...uploadResults[0] });
          mediaIds.push(media._id as mongoose.Types.ObjectId);
          if (detectedType === MediaType.image) {
            messageType = 'image';
          } else if (detectedType === MediaType.video) {
            messageType = 'video';
          } else {
            messageType = 'file';
          }
        }
      }
    }

    if (!data.text && mediaIds.length === 0) {
      throw new Error('Message text or attachment is required');
    }

    const message = await Message.create({
      chatId: chat._id,
      senderId: supportUserId,
      type: messageType,
      text: data.text?.trim() || '',
      replyToId: data.replyToId ? new mongoose.Types.ObjectId(data.replyToId) : undefined,
      medias: mediaIds,
      reactions: [],
      seenBy: []
    });

    // Update chat updatedAt timestamp
    chat.updatedAt = new Date();
    await chat.save();

    const populatedMessage = await Message.findById(message._id)
      .populate({
        path: 'senderId',
        select: 'name email profileImage userRole userId isVerified',
        populate: { path: 'profileImage' }
      })
      .populate('medias')
      .populate({
        path: 'replyToId',
        populate: [
          { path: 'senderId', select: 'name email profileImage userRole userId' },
          { path: 'medias' }
        ]
      });

    const formattedPayload = {
      id: message._id.toString(),
      _id: message._id.toString(),
      chatId: chat._id.toString(),
      senderId: populatedMessage?.senderId,
      senderIdStr: supportUserIdStr,
      isFromSupport: true,
      type: message.type,
      text: message.text,
      medias: (populatedMessage as any)?.medias || [],
      replyToId: (populatedMessage as any)?.replyToId || null,
      reactions: [],
      seenBy: [],
      isSeen: false,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt
    };

    // Broadcast to real-time sockets
    const io = this.getSocketIo();
    if (io) {
      const socketPayload = {
        success: true,
        event: 'new_message',
        ...formattedPayload
      };

      // Room of the chat
      io.to(`chat_${chatId}`).emit('new_message', socketPayload);

      // Customer personal room
      if (customerUserIdStr) {
        io.to(`user_${customerUserIdStr}`).emit('new_message', socketPayload);
        io.to(`user_${customerUserIdStr}`).emit('support_message_received', socketPayload);
      }

      // Support admins room
      io.to('support_admins').emit('new_support_message', socketPayload);
    }

    // Push notification to user
    if (customerUserIdStr) {
      try {
        await this.pushService.notifyUser(customerUserIdStr, {
          title: 'Contact Support',
          body: data.text || 'You have received a new message from Support.',
          data: {
            type: 'support_chat',
            chatId: chat._id.toString(),
            senderId: supportUserIdStr
          }
        });
      } catch (err) {
        AppLogger.error(`Failed to send push notification to user ${customerUserIdStr}:`, err);
      }
    }

    return formattedPayload;
  }

  /**
   * Start or open support chat with a specific registered user
   */
  public async startSupportChat(targetUserId: string) {
    const supportUser = await this.resolveSupportUser();
    const targetUser = await User.findById(targetUserId).populate('profileImage');
    if (!targetUser) {
      throw new Error('Target user not found');
    }

    const chat = await this.chatService.getOrCreateSingleChat(
      supportUser._id.toString(),
      targetUser._id.toString()
    );

    if (!chat) {
      throw new Error('Failed to create or retrieve support chat');
    }

    return {
      chatId: chat._id.toString(),
      user: targetUser,
      chat
    };
  }

  /**
   * Delete a message in support chat
   */
  public async deleteSupportMessage(messageId: string) {
    const message = await Message.findById(messageId);
    if (!message) {
      throw new Error('Message not found');
    }

    message.deletedAt = new Date();
    await message.save();

    const io = this.getSocketIo();
    if (io) {
      const deletePayload = {
        messageId,
        _id: messageId,
        chatId: message.chatId.toString(),
        deletedAt: message.deletedAt
      };
      io.to(`chat_${message.chatId}`).emit('message_deleted', deletePayload);
      io.to('support_admins').emit('message_deleted', deletePayload);
    }

    return { success: true, messageId };
  }

  /**
   * Mark support chat as read
   */
  public async markSupportChatRead(chatId: string) {
    const supportUser = await this.resolveSupportUser();
    await Message.updateMany(
      {
        chatId: new mongoose.Types.ObjectId(chatId),
        senderId: { $ne: supportUser._id },
        'seenBy.userId': { $ne: supportUser._id },
        deletedAt: { $exists: false }
      },
      {
        $addToSet: {
          seenBy: {
            userId: supportUser._id,
            seenAt: new Date()
          }
        }
      }
    );

    const io = this.getSocketIo();
    if (io) {
      io.to(`chat_${chatId}`).emit('chat_read_update', {
        chatId,
        userId: supportUser._id.toString(),
        readBySupport: true
      });
    }

    return { success: true, chatId };
  }

  /**
   * Get Support Chat overall metrics
   */
  public async getSupportStats() {
    const supportUser = await this.resolveSupportUser();
    const supportUserId = supportUser._id;

    const totalThreads = await Chat.countDocuments({
      'participants.userId': supportUserId,
      type: 'private'
    });

    // Unread messages
    const unreadMessages = await Message.countDocuments({
      senderId: { $ne: supportUserId },
      'seenBy.userId': { $ne: supportUserId },
      deletedAt: { $exists: false }
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const messagesToday = await Message.countDocuments({
      createdAt: { $gte: startOfToday },
      deletedAt: { $exists: false }
    });

    return {
      totalThreads,
      unreadMessages,
      messagesToday,
      supportEmail: supportUser.email,
      supportName: supportUser.name
    };
  }
}
