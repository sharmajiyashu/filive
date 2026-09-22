import { Service, Container } from 'typedi';
import mongoose from 'mongoose';
import Chat from '../../models/Chat';
import Message, { IAgencyHostInviteMetadata, toInviteFlag } from '../../models/Message';
import User from '../../models/User';
import Follow from '../../models/Follow';
import Block from '../../models/Block';
import { assertUsersNotBlocked } from '../../utils/blockCheck';

@Service()
export class ChatService {
  public static readonly SYSTEM_AVATAR_URL = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop';
  public static readonly SUPPORT_AVATAR_URL = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop';

  constructor() { }

  async getOrCreateOfficialMedia(url: string) {
    const MediaModel = mongoose.model('Media');
    let media = await MediaModel.findOne({ url });
    if (!media) {
      media = await MediaModel.create({
        url,
        mimetype: 'image/jpeg',
        type: 'image'
      });
    }
    return media;
  }

  async resolveSystemUser(): Promise<any> {
    const envId = process.env.SYSTEM_CHAT_USER_ID;
    const defaultMedia = await this.getOrCreateOfficialMedia(ChatService.SYSTEM_AVATAR_URL);

    if (envId && mongoose.Types.ObjectId.isValid(envId)) {
      const exists = await User.findById(envId).populate('profileImage');
      if (exists) {
        if (!exists.profileImage) {
          exists.profileImage = defaultMedia._id as any;
          await exists.save();
          const refreshed = await User.findById(exists._id).populate('profileImage');
          return refreshed || exists;
        }
        return exists;
      }
    }

    let systemUser = await User.findOne({
      $or: [
        { email: 'system@filive.com' },
        { name: 'System Message' },
        { name: 'System Messages' }
      ]
    }).populate('profileImage');

    if (!systemUser) {
      systemUser = await User.create({
        name: 'System Message',
        email: 'system@filive.com',
        userRole: 'admin',
        isVerified: true,
        bio: 'Official System Messages & Announcements',
        profileImage: defaultMedia._id
      });
      const refreshed = await User.findById(systemUser._id).populate('profileImage');
      return refreshed || systemUser;
    } else if (!systemUser.profileImage) {
      systemUser.profileImage = defaultMedia._id as any;
      await systemUser.save();
      const refreshed = await User.findById(systemUser._id).populate('profileImage');
      return refreshed || systemUser;
    }

    return systemUser;
  }

  async resolveSupportUser(): Promise<any> {
    const envId = process.env.SUPPORT_CHAT_USER_ID;
    const defaultMedia = await this.getOrCreateOfficialMedia(ChatService.SUPPORT_AVATAR_URL);

    if (envId && mongoose.Types.ObjectId.isValid(envId)) {
      const exists = await User.findById(envId).populate('profileImage');
      if (exists) {
        if (!exists.profileImage) {
          exists.profileImage = defaultMedia._id as any;
          await exists.save();
          const refreshed = await User.findById(exists._id).populate('profileImage');
          return refreshed || exists;
        }
        return exists;
      }
    }

    let supportUser = await User.findOne({
      $or: [
        { email: 'support@filive.com' },
        { name: 'Contact Support' },
        { name: 'Customer Support' }
      ]
    }).populate('profileImage');

    if (!supportUser) {
      supportUser = await User.create({
        name: 'Contact Support',
        email: 'support@filive.com',
        userRole: 'admin',
        isVerified: true,
        bio: 'Official Customer Support & Help Desk',
        profileImage: defaultMedia._id
      });
      const refreshed = await User.findById(supportUser._id).populate('profileImage');
      return refreshed || supportUser;
    } else if (!supportUser.profileImage) {
      supportUser.profileImage = defaultMedia._id as any;
      await supportUser.save();
      const refreshed = await User.findById(supportUser._id).populate('profileImage');
      return refreshed || supportUser;
    }

    return supportUser;
  }

  async getUserChats(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filter?: 'online' | 'frequent' | 'follow',
    search?: string
  ) {
    const skip = (page - 1) * limit;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    let systemUser: any = null;
    let supportUser: any = null;
    let systemUserIdStr = '';
    let supportUserIdStr = '';

    try {
      [systemUser, supportUser] = await Promise.all([
        this.resolveSystemUser(),
        this.resolveSupportUser()
      ]);
      systemUserIdStr = systemUser?._id?.toString() || '';
      supportUserIdStr = supportUser?._id?.toString() || '';

      if (systemUserIdStr && systemUserIdStr !== userId) {
        const sysChat = await this.getOrCreateSingleChat(userId, systemUserIdStr);
        if (sysChat) {
          const msgCount = await Message.countDocuments({ chatId: sysChat._id, deletedAt: { $exists: false } });
          if (msgCount === 0) {
            await Message.create({
              chatId: sysChat._id,
              senderId: systemUser._id,
              type: 'system',
              text: 'Welcome to Filive! Official system notifications and announcements will appear here.',
              seenBy: [],
              reactions: []
            });
          }
        }
      }

      if (supportUserIdStr && supportUserIdStr !== userId) {
        const supChat = await this.getOrCreateSingleChat(userId, supportUserIdStr);
        if (supChat) {
          const msgCount = await Message.countDocuments({ chatId: supChat._id, deletedAt: { $exists: false } });
          if (msgCount === 0) {
            await Message.create({
              chatId: supChat._id,
              senderId: supportUser._id,
              type: 'text',
              text: 'Hello! Welcome to Contact Support. How can we help you today?',
              seenBy: [],
              reactions: []
            });
          }
        }
      }
    } catch (e) {
      // Non-blocking fallback
    }

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

    const blockRows = await Block.find({
      $or: [{ blockerId: userObjectId }, { blockedId: userObjectId }]
    }).select('blockerId blockedId');

    const blockedByMeIds = new Set<string>();
    const blockedByOtherIds = new Set<string>();
    for (const row of blockRows) {
      if (row.blockerId.toString() === userId) {
        blockedByMeIds.add(row.blockedId.toString());
      } else {
        blockedByOtherIds.add(row.blockerId.toString());
      }
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

        let isBlocked = false;
        let blockedByMe = false;
        let blockedByOther = false;
        let blockMessage: string | null = null;
        if (chat.type === 'private' && otherParticipantIdStr) {
          blockedByMe = blockedByMeIds.has(otherParticipantIdStr);
          blockedByOther = blockedByOtherIds.has(otherParticipantIdStr);
          isBlocked = blockedByMe || blockedByOther;
          blockMessage = blockedByOther
            ? 'You are blocked by this user'
            : blockedByMe
              ? 'You have blocked this user'
              : null;
        }

        const formattedParticipants = chat.participants.map((p: any) => {
          const pObj = p.toObject ? p.toObject() : p;
          if (pObj.userId && typeof pObj.userId === 'object') {
            const pId = pObj.userId._id ? pObj.userId._id.toString() : '';
            const pSocketOnline = (io && pId) ? (io.sockets?.adapter?.rooms?.get(`user_${pId}`)?.size || 0) > 0 : false;
            const pRecentLogin = pObj.userId.lastLoginAt ? new Date(pObj.userId.lastLoginAt).getTime() > Date.now() - 15 * 60 * 1000 : false;
            const pOnline = pSocketOnline || pRecentLogin;

            let userProfileImg = pObj.userId.profileImage;
            if (!userProfileImg) {
              if (systemUserIdStr && pId === systemUserIdStr) {
                userProfileImg = systemUser?.profileImage || { url: ChatService.SYSTEM_AVATAR_URL, mimetype: 'image/jpeg', type: 'image' };
              } else if (supportUserIdStr && pId === supportUserIdStr) {
                userProfileImg = supportUser?.profileImage || { url: ChatService.SUPPORT_AVATAR_URL, mimetype: 'image/jpeg', type: 'image' };
              }
            }

            pObj.userId = {
              ...pObj.userId,
              profileImage: userProfileImg,
              isOnline: (systemUserIdStr && pId === systemUserIdStr) || (supportUserIdStr && pId === supportUserIdStr) ? true : pOnline,
              status: (systemUserIdStr && pId === systemUserIdStr) || (supportUserIdStr && pId === supportUserIdStr) ? 'online' : (pOnline ? 'online' : 'offline'),
              userStatus: (systemUserIdStr && pId === systemUserIdStr) || (supportUserIdStr && pId === supportUserIdStr) ? 'online' : (pOnline ? 'online' : 'offline')
            };
          }
          return pObj;
        });

        if (lastMessage && lastMessage.senderId && typeof lastMessage.senderId === 'object') {
          const senderIdStr = (lastMessage.senderId as any)._id?.toString();
          if (!(lastMessage.senderId as any).profileImage) {
            if (systemUserIdStr && senderIdStr === systemUserIdStr) {
              (lastMessage.senderId as any).profileImage = systemUser?.profileImage || { url: ChatService.SYSTEM_AVATAR_URL, mimetype: 'image/jpeg', type: 'image' };
            } else if (supportUserIdStr && senderIdStr === supportUserIdStr) {
              (lastMessage.senderId as any).profileImage = supportUser?.profileImage || { url: ChatService.SUPPORT_AVATAR_URL, mimetype: 'image/jpeg', type: 'image' };
            }
          }
        }

        const isSystem = Boolean(systemUserIdStr && otherParticipantIdStr === systemUserIdStr);
        const isSupport = Boolean(supportUserIdStr && otherParticipantIdStr === supportUserIdStr);

        if (isSystem) {
          name = 'System Message';
          isOnline = true;
          userStatus = 'online';
          if (!mediaUrl) {
            mediaUrl = systemUser?.profileImage ? ((systemUser.profileImage as any).url || systemUser.profileImage) : ChatService.SYSTEM_AVATAR_URL;
          }
          if (otherParticipantDetails && !otherParticipantDetails.profileImage) {
            otherParticipantDetails.profileImage = systemUser?.profileImage || {
              url: ChatService.SYSTEM_AVATAR_URL,
              mimetype: 'image/jpeg',
              type: 'image'
            };
          }
        } else if (isSupport) {
          name = 'Contact Support';
          isOnline = true;
          userStatus = 'online';
          if (!mediaUrl) {
            mediaUrl = supportUser?.profileImage ? ((supportUser.profileImage as any).url || supportUser.profileImage) : ChatService.SUPPORT_AVATAR_URL;
          }
          if (otherParticipantDetails && !otherParticipantDetails.profileImage) {
            otherParticipantDetails.profileImage = supportUser?.profileImage || {
              url: ChatService.SUPPORT_AVATAR_URL,
              mimetype: 'image/jpeg',
              type: 'image'
            };
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
          isSystem,
          isSupport,
          isOfficial: isSystem || isSupport,
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
          isBlocked,
          blockedByMe,
          blockedByOther,
          blockMessage,
          canSendMessage: !isBlocked,
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
          const blockedByMe = blockedByMeIds.has(globalUserIdStr);
          const blockedByOther = blockedByOtherIds.has(globalUserIdStr);
          const isBlocked = blockedByMe || blockedByOther;
          const blockMessage = blockedByOther
            ? 'You are blocked by this user'
            : blockedByMe
              ? 'You have blocked this user'
              : null;

          const isSystem = Boolean(systemUserIdStr && globalUserIdStr === systemUserIdStr);
          const isSupport = Boolean(supportUserIdStr && globalUserIdStr === supportUserIdStr);

          const defaultImg = isSystem
            ? (systemUser?.profileImage || { url: ChatService.SYSTEM_AVATAR_URL, mimetype: 'image/jpeg', type: 'image' })
            : isSupport
              ? (supportUser?.profileImage || { url: ChatService.SUPPORT_AVATAR_URL, mimetype: 'image/jpeg', type: 'image' })
              : null;
          const globalUserProfileImg = globalUserObj.profileImage || defaultImg;
          const itemMediaUrl = globalUserProfileImg ? ((globalUserProfileImg as any).url || globalUserProfileImg) : '';

          data.push({
            id: existingSingleChat ? existingSingleChat._id : (null as any),
            type: 'private',
            name: isSystem ? 'System Message' : isSupport ? 'Contact Support' : (globalUser.name || globalUser.email || 'User'),
            mediaUrl: itemMediaUrl,
            role: 'member',
            isMuted: false,
            isPinned: false,
            isSystem,
            isSupport,
            isOfficial: isSystem || isSupport,
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
              profileImage: globalUserProfileImg,
              isOnline,
              status: userStatus,
              userStatus
            },
            participants: [
              { userId: userObjectId as any, role: 'admin', isMuted: false, isPinned: false, joinedAt: new Date() },
              { userId: { ...globalUserObj, profileImage: globalUserProfileImg, isOnline, status: userStatus, userStatus } as any, role: 'member', isMuted: false, isPinned: false, joinedAt: new Date() }
            ],
            isBlocked,
            blockedByMe,
            blockedByOther,
            blockMessage,
            canSendMessage: !isBlocked,
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
      // 1. System Message always top
      const aIsSystem = a.isSystem || (systemUserIdStr && a.userId === systemUserIdStr);
      const bIsSystem = b.isSystem || (systemUserIdStr && b.userId === systemUserIdStr);
      if (aIsSystem && !bIsSystem) return -1;
      if (!aIsSystem && bIsSystem) return 1;

      // 2. Contact Support always second
      const aIsSupport = a.isSupport || (supportUserIdStr && a.userId === supportUserIdStr);
      const bIsSupport = b.isSupport || (supportUserIdStr && b.userId === supportUserIdStr);
      if (aIsSupport && !bIsSupport) return -1;
      if (!aIsSupport && bIsSupport) return 1;

      // 3. Pinned chats
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      // 4. Latest activity
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

    let systemUser: any = null;
    let supportUser: any = null;
    let systemUserIdStr = '';
    let supportUserIdStr = '';
    try {
      [systemUser, supportUser] = await Promise.all([
        this.resolveSystemUser(),
        this.resolveSupportUser()
      ]);
      systemUserIdStr = systemUser?._id?.toString() || '';
      supportUserIdStr = supportUser?._id?.toString() || '';
    } catch (e) { }

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

        let userProfileImg = pObj.userId.profileImage;
        if (!userProfileImg) {
          if (systemUserIdStr && pId === systemUserIdStr) {
            userProfileImg = systemUser?.profileImage || { url: ChatService.SYSTEM_AVATAR_URL, mimetype: 'image/jpeg', type: 'image' };
          } else if (supportUserIdStr && pId === supportUserIdStr) {
            userProfileImg = supportUser?.profileImage || { url: ChatService.SUPPORT_AVATAR_URL, mimetype: 'image/jpeg', type: 'image' };
          }
        }

        pObj.userId = {
          ...pObj.userId,
          profileImage: userProfileImg,
          isOnline: (systemUserIdStr && pId === systemUserIdStr) || (supportUserIdStr && pId === supportUserIdStr) ? true : pOnline,
          status: (systemUserIdStr && pId === systemUserIdStr) || (supportUserIdStr && pId === supportUserIdStr) ? 'online' : (pOnline ? 'online' : 'offline'),
          userStatus: (systemUserIdStr && pId === systemUserIdStr) || (supportUserIdStr && pId === supportUserIdStr) ? 'online' : (pOnline ? 'online' : 'offline')
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
      blockMessage: blockedByOther
        ? 'You are blocked by this user'
        : blockedByMe
          ? 'You have blocked this user'
          : null,
      canSendMessage: !isBlocked,
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

    if (userId !== targetUserId) {
      await assertUsersNotBlocked(userId, targetUserId);
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

