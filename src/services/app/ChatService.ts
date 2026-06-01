import { Service, Container } from 'typedi';
import mongoose from 'mongoose';
import Chat from '../../models/Chat';
import Message from '../../models/Message';
import User from '../../models/User';
import Follow from '../../models/Follow';

@Service()
export class ChatService {
  constructor() {}

  async getUserChats(userId: string, page: number = 1, limit: number = 20, filter?: 'online' | 'frequent' | 'follow') {
    const skip = (page - 1) * limit;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const chats = await Chat.find({
      'participants.userId': userObjectId,
    })
      .populate({
        path: 'participants.userId',
        select: 'name email profileImage userRole',
        populate: { path: 'profileImage' }
      })
      .populate('mediaId');

    let io: any;
    try {
      io = Container.get('socket');
    } catch (e) {}

    const followedUserIds = new Set<string>();
    if (filter === 'follow') {
      const follows = await Follow.find({ followerId: userObjectId, status: 'accepted' }).select('followingId');
      follows.forEach(f => followedUserIds.add(f.followingId.toString()));
    }

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

        const messageCount = await Message.countDocuments({ chatId: chat._id });

        let name = chat.name || '';
        let mediaUrl = chat.mediaId ? (chat.mediaId as any).url : '';

        let otherParticipant = chat.participants.find(
          (p) => p.userId && p.userId._id.toString() !== userId
        );

        let otherParticipantDetails = null;
        if (otherParticipant && otherParticipant.userId) {
          otherParticipantDetails = (otherParticipant.userId as any).toObject 
            ? (otherParticipant.userId as any).toObject() 
            : otherParticipant.userId;
        }

        if (chat.type === 'private' && otherParticipant && otherParticipant.userId) {
          const otherUser = otherParticipant.userId as any;
          name = otherUser.name || otherUser.email || 'User';
          mediaUrl = otherUser.profileImage ? otherUser.profileImage.url : '';
        }

        let isOnline = false;
        if (io && otherParticipant && otherParticipant.userId) {
          const otherId = otherParticipant.userId._id.toString();
          const room = io.sockets.adapter.rooms.get(`user_${otherId}`);
          isOnline = room && room.size > 0;
        }

        const isFollowed = otherParticipant && otherParticipant.userId && followedUserIds.has(otherParticipant.userId._id.toString());

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
          messageCount,
          isOnline,
          isFollowed,
          lastMessage,
          otherParticipant: otherParticipantDetails,
          updatedAt: chat.updatedAt
        };
      })
    );

    let filteredData = data;
    if (filter === 'online') {
      filteredData = data.filter(d => d.isOnline);
    } else if (filter === 'frequent') {
      filteredData = data.filter(d => d.messageCount >= 5);
    } else if (filter === 'follow') {
      filteredData = data.filter(d => d.isFollowed);
    }

    filteredData.sort((a, b) => {
      const dateA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.updatedAt).getTime();
      const dateB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.updatedAt).getTime();
      return dateB - dateA;
    });

    const total = filteredData.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedData = filteredData.slice(skip, skip + limit);

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

  async getChatDetails(userId: string, chatId: string) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const chatObjectId = new mongoose.Types.ObjectId(chatId);

    const chat = await Chat.findOne({
      _id: chatObjectId,
      'participants.userId': userObjectId
    })
      .populate({
        path: 'participants.userId',
        select: 'name email profileImage userRole coins gender dob location country bio',
        populate: { path: 'profileImage' }
      })
      .populate('mediaId');

    if (!chat) {
      throw new Error('Chat not found or access denied');
    }

    let isBlocked = false;
    let blockedByMe = false;
    let blockedByOther = false;
    let otherParticipantIdStr = '';

    const otherParticipant = chat.participants.find(
      (p) => p.userId && p.userId._id.toString() !== userId
    );

    if (chat.type === 'private' && otherParticipant && otherParticipant.userId) {
      const BlockModel = mongoose.model('Block');
      otherParticipantIdStr = otherParticipant.userId._id.toString();
      
      const blockRelation = await BlockModel.findOne({
        $or: [
          { blockerId: userObjectId, blockedId: otherParticipant.userId._id },
          { blockerId: otherParticipant.userId._id, blockedId: userObjectId }
        ]
      });

      if (blockRelation) {
        isBlocked = true;
        if (blockRelation.blockerId.toString() === userId) {
          blockedByMe = true;
        } else {
          blockedByOther = true;
        }
      }
    }

    const participantInfo = chat.participants.find(
      (p) => p.userId && p.userId._id.toString() === userId
    );

    return {
      id: chat._id,
      type: chat.type,
      name: chat.name,
      mediaId: chat.mediaId,
      participants: chat.participants,
      isMuted: participantInfo ? participantInfo.isMuted : false,
      isPinned: participantInfo ? participantInfo.isPinned : false,
      isBlocked,
      blockedByMe,
      blockedByOther,
      otherParticipantId: otherParticipantIdStr || null,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt
    };
  }

  async createChat(userId: string, data: { name?: string; type: 'private' | 'group'; participants: string[]; mediaId?: string }) {
    if (data.type === 'private') {
      const targetUserId = data.participants.find(p => p !== userId);
      if (targetUserId) {
        return this.getOrCreateSingleChat(userId, targetUserId);
      }
    }

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

    const query: any = {
      type: 'private',
      participants: { $size: 2 }
    };

    if (userId === targetUserId) {
      query.$and = [
        { 'participants.0.userId': userObjectId },
        { 'participants.1.userId': userObjectId }
      ];
    } else {
      query['participants.userId'] = { $all: [userObjectId, targetUserObjectId] };
    }

    const existingChat = await Chat.findOne(query)
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

  async deleteChat(userId: string, chatId: string) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const chatObjectId = new mongoose.Types.ObjectId(chatId);

    const chat = await Chat.findOne({
      _id: chatObjectId,
      'participants.userId': userObjectId
    });

    if (!chat) {
      throw new Error('Chat not found or access denied');
    }

    await Message.deleteMany({ chatId: chatObjectId });
    await Chat.deleteOne({ _id: chatObjectId });

    return { message: 'Chat deleted successfully' };
  }
}

