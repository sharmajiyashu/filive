import { Service, Container } from 'typedi';
import mongoose from 'mongoose';
import Chat from '../../models/Chat';
import Message, { IAgencyHostInviteMetadata, toInviteFlag } from '../../models/Message';
import User from '../../models/User';
import Follow from '../../models/Follow';

@Service()
export class ChatService {
  constructor() { }

  async getUserChats(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filter?: 'online' | 'frequent' | 'follow',
    search?: string
  ) {
    const skip = (page - 1) * limit;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const chats = await Chat.find({
      'participants.userId': userObjectId,
    })
      .populate({
        path: 'participants.userId',
        select: 'name email profileImage userRole coins gender dob location country bio userId mobile lastLoginAt isVerified',
        populate: { path: 'profileImage' }
      })
      .populate('mediaId');

    let io: any;
    try {
      io = Container.get('socket');
    } catch (e) { }

    const followedUserIds = new Set<string>();
    if (filter === 'follow' || search) {
      const follows = await Follow.find({ followerId: userObjectId, status: 'accepted' }).select('followingId');
      follows.forEach(f => followedUserIds.add(f.followingId.toString()));
    }

    let data = await Promise.all(
      chats.map(async (chat) => {
        const lastMessage = await Message.findOne({ chatId: chat._id, deletedAt: { $exists: false } })
          .sort({ createdAt: -1 })
          .populate({
            path: 'senderId',
            select: 'name email profileImage userRole userId dob lastLoginAt isVerified',
            populate: { path: 'profileImage' }
          })
          .populate('medias')
          .populate({
            path: 'replyToId',
            populate: [
              { path: 'senderId', select: 'name email profileImage userRole userId dob lastLoginAt isVerified' },
              { path: 'medias' }
            ]
          });

        const participantInfo = chat.participants.find(
          (p) => p.userId && (p.userId._id ? p.userId._id.toString() : p.userId.toString()) === userId
        );

        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          senderId: { $ne: userObjectId },
          'seenBy.userId': { $ne: userObjectId },
          deletedAt: { $exists: false }
        });

        const messageCount = await Message.countDocuments({ chatId: chat._id, deletedAt: { $exists: false } });

        let name = chat.name || '';
        let mediaUrl = chat.mediaId ? (chat.mediaId as any).url : '';

        let otherParticipant = chat.participants.find(
          (p) => p.userId && (p.userId._id ? p.userId._id.toString() : p.userId.toString()) !== userId
        );
        if (!otherParticipant && chat.participants.length > 0) {
          otherParticipant = chat.participants[0];
        }

        let isOnline = false;
        let userStatus: 'online' | 'offline' = 'offline';
        let otherParticipantDetails = null;
        let otherParticipantIdStr = '';

        if (otherParticipant && otherParticipant.userId) {
          const otherUser = (otherParticipant.userId as any).toObject
            ? (otherParticipant.userId as any).toObject()
            : otherParticipant.userId;
          otherParticipantIdStr = otherUser._id ? otherUser._id.toString() : '';

          const socketOnline = (io && otherParticipantIdStr)
            ? (io.sockets?.adapter?.rooms?.get(`user_${otherParticipantIdStr}`)?.size || 0) > 0
            : false;
          const recentLogin = otherUser.lastLoginAt
            ? new Date(otherUser.lastLoginAt).getTime() > Date.now() - 15 * 60 * 1000
            : false;

          isOnline = socketOnline || recentLogin;
          userStatus = isOnline ? 'online' : 'offline';

          otherParticipantDetails = {
            id: otherParticipantIdStr,
            ...otherUser,
            isOnline,
            status: userStatus,
            userStatus
          };
        }

        if (chat.type === 'private' && otherParticipant && otherParticipant.userId) {
          const otherUser = otherParticipant.userId as any;
          name = otherUser.name || otherUser.email || 'User';
          mediaUrl = otherUser.profileImage ? otherUser.profileImage.url : '';
        }

        const isFollowed = otherParticipant && otherParticipant.userId && followedUserIds.has(otherParticipantIdStr);

        const pendingHostInviteMessage = await Message.findOne({
          chatId: chat._id,
          type: 'agency_host_invite',
          $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
          'metadata.status': 'PENDING',
          senderId: { $ne: userObjectId },
        }).sort({ createdAt: -1 });

        let agencyHostRequest = null;
        if (pendingHostInviteMessage?.metadata) {
          const meta = pendingHostInviteMessage.metadata as IAgencyHostInviteMetadata;
          agencyHostRequest = {
            messageId: pendingHostInviteMessage._id.toString(),
            type: 'agency_host_invite',
            messageType: 'agency_host_invite',
            requestId: meta.agencyHostRequestId,
            agencyId: meta.agencyId,
            agencyName: meta.agencyName,
            status: meta.status,
            flag: meta.flag ?? toInviteFlag(meta.status),
            isOpened: meta.isOpened ?? false,
            isVerified: meta.isVerified ?? false,
            openedAt: meta.openedAt,
            verifiedAt: meta.verifiedAt,
            text: pendingHostInviteMessage.text,
          };
        }

        const formattedParticipants = chat.participants.map((p: any) => {
          const pObj = p.toObject ? p.toObject() : p;
          if (pObj.userId && typeof pObj.userId === 'object') {
            const pId = pObj.userId._id ? pObj.userId._id.toString() : '';
            const pSocketOnline = (io && pId) ? (io.sockets?.adapter?.rooms?.get(`user_${pId}`)?.size || 0) > 0 : false;
            const pRecentLogin = pObj.userId.lastLoginAt ? new Date(pObj.userId.lastLoginAt).getTime() > Date.now() - 15 * 60 * 1000 : false;
            const pOnline = pSocketOnline || pRecentLogin;
            pObj.userId = {
              ...pObj.userId,
              isOnline: pOnline,
              status: pOnline ? 'online' : 'offline',
              userStatus: pOnline ? 'online' : 'offline'
            };
          }
          return pObj;
        });

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
          status: userStatus,
          userStatus,
          isFollowed,
          lastMessage,
          lastMessageType: lastMessage?.type || null,
          agencyHostRequest,
          userId: otherParticipantIdStr || null,
          otherParticipant: otherParticipantDetails,
          participants: formattedParticipants,
          updatedAt: chat.updatedAt
        };
      })
    );

    if (search && search.trim() !== '') {
      const searchStr = search.trim();
      const searchLower = searchStr.toLowerCase();
      const searchNum = Number(searchStr);
      const isSearchNum = !isNaN(searchNum);

      data = data.filter((item: any) => {
        const nameMatch = item.name && item.name.toLowerCase().includes(searchLower);
        const otherUser = item.otherParticipant;
        if (!otherUser) return nameMatch;

        const otherNameMatch = otherUser.name && otherUser.name.toLowerCase().includes(searchLower);
        const otherEmailMatch = otherUser.email && otherUser.email.toLowerCase().includes(searchLower);
        const otherMobileMatch = otherUser.mobile && otherUser.mobile.toLowerCase().includes(searchLower);
        const otherUserIdNumMatch = isSearchNum && otherUser.userId === searchNum;
        const otherUserIdStrMatch = otherUser.userId !== undefined && String(otherUser.userId).includes(searchStr);
        const otherCountryMatch = otherUser.country && otherUser.country.toLowerCase().includes(searchLower);
        const otherBioMatch = otherUser.bio && otherUser.bio.toLowerCase().includes(searchLower);

        return nameMatch || otherNameMatch || otherEmailMatch || otherMobileMatch || otherUserIdNumMatch || otherUserIdStrMatch || otherCountryMatch || otherBioMatch;
      });

      const userSearchConditions: any[] = [
        { name: { $regex: searchStr, $options: 'i' } },
        { email: { $regex: searchStr, $options: 'i' } },
        { mobile: { $regex: searchStr, $options: 'i' } },
        { country: { $regex: searchStr, $options: 'i' } },
        { nationality: { $regex: searchStr, $options: 'i' } },
        { 'location.city': { $regex: searchStr, $options: 'i' } },
        { gender: { $regex: searchStr, $options: 'i' } },
        { bio: { $regex: searchStr, $options: 'i' } }
      ];
      if (isSearchNum) {
        userSearchConditions.push({ userId: searchNum });
      }

      const globalUsers = await User.find({
        _id: { $ne: userObjectId },
        $or: userSearchConditions
      })
        .select('name email profileImage userRole coins gender dob location country bio userId mobile lastLoginAt isVerified')
        .populate('profileImage')
        .limit(20);

      for (const globalUser of globalUsers) {
        const globalUserIdStr = globalUser._id.toString();
        const alreadyInChats = data.some(
          (d: any) => d.otherParticipant && (d.otherParticipant.id === globalUserIdStr || d.otherParticipant._id?.toString() === globalUserIdStr)
        );

        if (!alreadyInChats) {
          const existingSingleChat = await Chat.findOne({
            type: 'private',
            'participants.userId': { $all: [userObjectId, globalUser._id] }
          });

          const socketOnline = io ? (io.sockets?.adapter?.rooms?.get(`user_${globalUserIdStr}`)?.size || 0) > 0 : false;
          const recentLogin = globalUser.lastLoginAt ? new Date(globalUser.lastLoginAt).getTime() > Date.now() - 15 * 60 * 1000 : false;
          const isOnline = socketOnline || recentLogin;
          const userStatus = isOnline ? 'online' : 'offline';

          const isFollowed = followedUserIds.has(globalUserIdStr);
          const globalUserObj = globalUser.toObject ? globalUser.toObject() : globalUser;

          data.push({
            id: existingSingleChat ? existingSingleChat._id : (null as any),
            type: 'private',
            name: globalUser.name || globalUser.email || 'User',
            mediaUrl: globalUser.profileImage ? (globalUser.profileImage as any).url : '',
            role: 'member',
            isMuted: false,
            isPinned: false,
            lastSeenAt: null,
            archiveAt: null,
            unreadCount: 0,
            messageCount: 0,
            isOnline,
            status: userStatus,
            userStatus,
            isFollowed,
            lastMessage: null,
            lastMessageType: null,
            agencyHostRequest: null,
            userId: globalUserIdStr,
            otherParticipant: {
              id: globalUserIdStr,
              ...globalUserObj,
              isOnline,
              status: userStatus,
              userStatus
            },
            participants: [
              { userId: userObjectId as any, role: 'admin', isMuted: false, isPinned: false, joinedAt: new Date() },
              { userId: { ...globalUserObj, isOnline, status: userStatus, userStatus } as any, role: 'member', isMuted: false, isPinned: false, joinedAt: new Date() }
            ],
            updatedAt: (globalUser as any).updatedAt || new Date()
          });
        }
      }
    }

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
        select: 'name email profileImage userRole coins gender dob location country bio userId mobile lastLoginAt isVerified',
        populate: { path: 'profileImage' }
      })
      .populate('mediaId');

    if (!chat) {
      throw new Error('Chat not found or access denied');
    }

    let io: any;
    try {
      io = Container.get('socket');
    } catch (e) { }

    let isBlocked = false;
    let blockedByMe = false;
    let blockedByOther = false;
    let otherParticipantIdStr = '';

    const otherParticipant = chat.participants.find(
      (p) => p.userId && (p.userId._id ? p.userId._id.toString() : p.userId.toString()) !== userId
    );

    if (chat.type === 'private' && otherParticipant && otherParticipant.userId) {
      const BlockModel = mongoose.model('Block');
      otherParticipantIdStr = otherParticipant.userId._id ? otherParticipant.userId._id.toString() : otherParticipant.userId.toString();

      const blockRelation = await BlockModel.findOne({
        $or: [
          { blockerId: userObjectId, blockedId: otherParticipant.userId._id || otherParticipant.userId },
          { blockerId: otherParticipant.userId._id || otherParticipant.userId, blockedId: userObjectId }
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
      (p) => p.userId && (p.userId._id ? p.userId._id.toString() : p.userId.toString()) === userId
    );

    const formattedParticipants = chat.participants.map((p: any) => {
      const pObj = p.toObject ? p.toObject() : p;
      if (pObj.userId && typeof pObj.userId === 'object') {
        const pId = pObj.userId._id ? pObj.userId._id.toString() : '';
        const pSocketOnline = (io && pId) ? (io.sockets?.adapter?.rooms?.get(`user_${pId}`)?.size || 0) > 0 : false;
        const pRecentLogin = pObj.userId.lastLoginAt ? new Date(pObj.userId.lastLoginAt).getTime() > Date.now() - 15 * 60 * 1000 : false;
        const pOnline = pSocketOnline || pRecentLogin;
        pObj.userId = {
          ...pObj.userId,
          isOnline: pOnline,
          status: pOnline ? 'online' : 'offline',
          userStatus: pOnline ? 'online' : 'offline'
        };
      }
      return pObj;
    });

    return {
      id: chat._id,
      type: chat.type,
      name: chat.name,
      mediaId: chat.mediaId,
      participants: formattedParticipants,
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
        select: 'name email profileImage userRole coins gender dob location country bio userId',
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
        select: 'name email profileImage userRole coins gender dob location country bio userId',
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
        select: 'name email profileImage userRole coins gender dob location country bio userId',
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

  async togglePinChat(userId: string, chatId: string) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const chatObjectId = new mongoose.Types.ObjectId(chatId);

    const chat = await Chat.findOne({
      _id: chatObjectId,
      'participants.userId': userObjectId
    });

    if (!chat) {
      throw new Error('Chat not found or access denied');
    }

    const participant = chat.participants.find(p => p.userId.toString() === userId);
    if (!participant) {
      throw new Error('Participant not found');
    }

    participant.isPinned = !participant.isPinned;
    await chat.save();

    return { isPinned: participant.isPinned, message: participant.isPinned ? 'Chat pinned successfully' : 'Chat unpinned successfully' };
  }

  async clearChatHistory(userId: string, chatId: string) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const chatObjectId = new mongoose.Types.ObjectId(chatId);

    const chat = await Chat.findOne({
      _id: chatObjectId,
      'participants.userId': userObjectId
    });

    if (!chat) {
      throw new Error('Chat not found or access denied');
    }

    const participant = chat.participants.find(p => p.userId.toString() === userId);
    if (participant) {
      participant.clearedAt = new Date();
      await chat.save();
    }

    return { message: 'Chat history cleared for you successfully' };
  }
}

