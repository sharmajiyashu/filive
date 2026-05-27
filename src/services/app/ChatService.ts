import { Service } from 'typedi';
import mongoose from 'mongoose';
import Chat from '../../models/Chat';
import Message from '../../models/Message';
import User from '../../models/User';

@Service()
export class ChatService {
  constructor() {}

  async getUserChats(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const total = await Chat.countDocuments({
      'participants.userId': userObjectId,
    });

    const totalPages = Math.ceil(total / limit);

    const chats = await Chat.find({
      'participants.userId': userObjectId,
    })
      .populate({
        path: 'participants.userId',
        select: 'name email profileImage userRole',
        populate: { path: 'profileImage' }
      })
      .populate('mediaId');

    const data = await Promise.all(
      chats.map(async (chat) => {
        const lastMessage = await Message.findOne({ chatId: chat._id })
          .sort({ createdAt: -1 })
          .populate({
            path: 'senderId',
            select: 'name email profileImage userRole',
            populate: { path: 'profileImage' }
          })
          .populate('medias')
          .populate({
            path: 'replyToId',
            populate: [
              { path: 'senderId', select: 'name email profileImage userRole' },
              { path: 'medias' }
            ]
          });

        const participantInfo = chat.participants.find(
          (p) => p.userId && p.userId._id.toString() === userId
        );

        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          senderId: { $ne: userObjectId },
          'seenBy.userId': { $ne: userObjectId }
        });

        let name = chat.name || '';
        let mediaUrl = chat.mediaId ? (chat.mediaId as any).url : '';

        if (chat.type === 'private') {
          const otherParticipant = chat.participants.find(
            (p) => p.userId && p.userId._id.toString() !== userId
          );
          if (otherParticipant && otherParticipant.userId) {
            const otherUser = otherParticipant.userId as any;
            name = otherUser.name || otherUser.email || 'User';
            mediaUrl = otherUser.profileImage ? otherUser.profileImage.url : '';
          }
        }

        return {
          id: chat._id,
          type: chat.type,
          name,
          mediaUrl,
          role: participantInfo ? participantInfo.role : 'member',
          isMuted: participantInfo ? participantInfo.isMuted : false,
          isPinned: participantInfo ? participantInfo.isPinned : false,
          lastSeenAt: participantInfo ? participantInfo.lastSeenAt : null,
          archiveAt: participantInfo ? participantInfo.archiveAt : null,
          unreadCount,
          lastMessage,
          updatedAt: chat.updatedAt
        };
      })
    );

    data.sort((a, b) => {
      const dateA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.updatedAt).getTime();
      const dateB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.updatedAt).getTime();
      return dateB - dateA;
    });

    const paginatedData = data.slice(skip, skip + limit);

    return {
      data: paginatedData,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  async createChat(userId: string, data: { name?: string; type: 'private' | 'group'; participants: string[]; mediaId?: string }) {
    const participantsList: any[] = [
      {
        userId: new mongoose.Types.ObjectId(userId),
        role: 'admin',
        joinedAt: new Date(),
        isMuted: false,
        isPinned: false
      }
    ];

    for (const participantId of data.participants) {
      if (participantId !== userId) {
        participantsList.push({
          userId: new mongoose.Types.ObjectId(participantId),
          role: 'member',
          joinedAt: new Date(),
          isMuted: false,
          isPinned: false
        });
      }
    }

    const chat = await Chat.create({
      type: data.type || 'group',
      name: data.name || '',
      mediaId: data.mediaId ? new mongoose.Types.ObjectId(data.mediaId) : undefined,
      participants: participantsList
    });

    const populatedChat = await Chat.findById(chat._id)
      .populate({
        path: 'participants.userId',
        select: 'name email profileImage userRole',
        populate: { path: 'profileImage' }
      })
      .populate('mediaId');

    return populatedChat;
  }

  async getOrCreateSingleChat(userId: string, targetUserId: string) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const targetUserObjectId = new mongoose.Types.ObjectId(targetUserId);

    const existingChat = await Chat.findOne({
      type: 'private',
      'participants.userId': { $all: [userObjectId, targetUserObjectId] }
    })
      .populate({
        path: 'participants.userId',
        select: 'name email profileImage userRole',
        populate: { path: 'profileImage' }
      })
      .populate('mediaId');

    if (existingChat) {
      return existingChat;
    }

    const chat = await Chat.create({
      type: 'private',
      name: '',
      participants: [
        {
          userId: userObjectId,
          role: 'admin',
          joinedAt: new Date(),
          isMuted: false,
          isPinned: false
        },
        {
          userId: targetUserObjectId,
          role: 'member',
          joinedAt: new Date(),
          isMuted: false,
          isPinned: false
        }
      ]
    });

    const populatedChat = await Chat.findById(chat._id)
      .populate({
        path: 'participants.userId',
        select: 'name email profileImage userRole',
        populate: { path: 'profileImage' }
      })
      .populate('mediaId');

    return populatedChat;
  }
}
