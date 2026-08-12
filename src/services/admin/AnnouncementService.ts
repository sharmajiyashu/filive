import { Service, Container } from 'typedi';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import Announcement from '../../models/Announcement';
import User from '../../models/User';
import Message from '../../models/Message';
import Chat from '../../models/Chat';
import { ChatService } from '../app/ChatService';
import { FirebasePushService } from '../common/FirebasePushService';
import AppLogger from '../../api/loaders/logger';

@Service()
export class AnnouncementService {
  private chatService = Container.get(ChatService);
  private pushService = Container.get(FirebasePushService);

  private getSocketIo(): Server | null {
    try {
      return Container.get('socket') as Server;
    } catch {
      return null;
    }
  }

  private emitSocketEvent(event: string, room: string, payload: unknown) {
    const io = this.getSocketIo();
    if (!io) return;
    io.to(room).emit(event, payload);
  }

  /** Official sender for announcement chats — env SYSTEM_CHAT_USER_ID or first admin. */
  private async resolveSystemSenderId(): Promise<string> {
    const envId = process.env.SYSTEM_CHAT_USER_ID;
    if (envId && mongoose.Types.ObjectId.isValid(envId)) {
      const exists = await User.findById(envId).select('_id');
      if (exists) return exists._id.toString();
    }

    const admin = await User.findOne({ userRole: 'admin' }).select('_id').sort({ createdAt: 1 });
    if (!admin) {
      throw new Error(
        'SYSTEM_CHAT_USER_ID is not set and no admin user exists to send announcement chats'
      );
    }
    return admin._id.toString();
  }

  public async getSummary() {
    const [
      totalAnnouncement,
      active,
      inactive,
      allAudience,
      specificUser,
      imageMedia,
      videoMedia,
      textOnly,
    ] = await Promise.all([
      Announcement.countDocuments({}),
      Announcement.countDocuments({ status: 'active' }),
      Announcement.countDocuments({ status: 'inactive' }),
      Announcement.countDocuments({ audienceType: 'all' }),
      Announcement.countDocuments({ audienceType: 'specific_user' }),
      Announcement.countDocuments({ mediaType: 'image' }),
      Announcement.countDocuments({ mediaType: 'video' }),
      Announcement.countDocuments({ mediaType: 'none' }),
    ]);

    return {
      totalAnnouncement,
      active,
      inactive,
      allAudience,
      specificUser,
      imageMedia,
      videoMedia,
      textOnly,
    };
  }

  public async list(opts: { page?: number; limit?: number; search?: string; status?: string }) {
    const page = opts.page || 1;
    const limit = opts.limit || 10;
    const query: any = {};

    if (opts.status && opts.status !== 'all') {
      query.status = opts.status;
    }

    if (opts.search?.trim()) {
      const term = opts.search.trim();
      query.$or = [
        { title: { $regex: term, $options: 'i' } },
        { message: { $regex: term, $options: 'i' } },
      ];
    }

    const [items, total, summary] = await Promise.all([
      Announcement.find(query)
        .populate({
          path: 'userId',
          select: 'userId name email profileImage',
          populate: { path: 'profileImage' },
        })
        .populate('mediaId')
        .populate({ path: 'createdBy', select: 'name email userId' })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Announcement.countDocuments(query),
      this.getSummary(),
    ]);

    return {
      announcements: items,
      summary,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  private async deliverToChat(
    announcement: any,
    targetUserIds: string[],
    systemSenderId: string
  ) {
    const mediaIds = announcement.mediaId ? [announcement.mediaId] : [];
    const metadata = {
      type: 'announcement' as const,
      announcementId: announcement._id.toString(),
      title: announcement.title,
      redirectUrl: announcement.redirectUrl || '',
      mediaType: announcement.mediaType || 'none',
    };

    const batchSize = 50;
    for (let i = 0; i < targetUserIds.length; i += batchSize) {
      const batch = targetUserIds.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (targetUserId) => {
          try {
            if (targetUserId === systemSenderId) return;
            const chat = await this.chatService.getOrCreateSingleChat(systemSenderId, targetUserId);
            if (!chat) return;

            const message = await Message.create({
              chatId: chat._id,
              senderId: new mongoose.Types.ObjectId(systemSenderId),
              type: 'announcement',
              text: announcement.message,
              medias: mediaIds,
              metadata,
              seenBy: [{ userId: new mongoose.Types.ObjectId(systemSenderId), seenAt: new Date() }],
              reactions: [],
            });

            await Chat.findByIdAndUpdate(chat._id, { updatedAt: new Date() });

            const populated = await Message.findById(message._id)
              .populate({
                path: 'senderId',
                select: 'name email profileImage userRole userId',
                populate: { path: 'profileImage' },
              })
              .populate('medias');

            const payload = populated?.toObject ? populated.toObject() : populated;
            this.emitSocketEvent('new_message', `chat_${chat._id}`, payload);
            this.emitSocketEvent('new_message', `user_${targetUserId}`, payload);
          } catch (err: any) {
            AppLogger.warn(
              `[AnnouncementService] chat deliver failed for ${targetUserId}: ${err?.message}`
            );
          }
        })
      );
    }
  }

  public async create(opts: {
    title: string;
    message: string;
    redirectUrl?: string;
    audienceType: 'all' | 'specific_user';
    userId?: string;
    mediaType?: 'image' | 'video' | 'none';
    mediaId?: string;
    createdBy: string;
  }) {
    if (!opts.title?.trim() || !opts.message?.trim()) {
      throw new Error('Title and message are required');
    }

    const audienceType = opts.audienceType === 'specific_user' ? 'specific_user' : 'all';
    if (audienceType === 'specific_user') {
      if (!opts.userId || !mongoose.Types.ObjectId.isValid(opts.userId)) {
        throw new Error('userId is required for specific_user audience');
      }
      const target = await User.findById(opts.userId).select('_id');
      if (!target) throw new Error('Target user not found');
    }

    let mediaType: 'image' | 'video' | 'none' = opts.mediaType || 'none';
    if (!opts.mediaId) mediaType = 'none';

    const announcement = await Announcement.create({
      title: opts.title.trim(),
      message: opts.message.trim(),
      redirectUrl: opts.redirectUrl?.trim() || undefined,
      audienceType,
      userId: audienceType === 'specific_user' ? opts.userId : undefined,
      mediaType,
      mediaId: opts.mediaId || undefined,
      status: 'active',
      createdBy: opts.createdBy,
    });

    const systemSenderId = await this.resolveSystemSenderId();
    let targetUserIds: string[] = [];

    if (audienceType === 'specific_user' && opts.userId) {
      targetUserIds = [opts.userId];
    } else {
      const users = await User.find({ userRole: 'user', isBlocked: false }).select('_id').lean();
      targetUserIds = users.map((u) => u._id.toString());
    }

    // Deliver chat + push asynchronously so create response stays fast
    setImmediate(async () => {
      try {
        await this.deliverToChat(announcement, targetUserIds, systemSenderId);
        await this.pushService.notifyUsers(audienceType === 'all' ? 'all' : targetUserIds, {
          title: announcement.title,
          body: announcement.message,
          data: {
            type: 'announcement',
            announcementId: announcement._id.toString(),
            redirectUrl: announcement.redirectUrl || '',
          },
        });
      } catch (err: any) {
        AppLogger.error(`[AnnouncementService] delivery failed: ${err?.message}`, err);
      }
    });

    return Announcement.findById(announcement._id)
      .populate({
        path: 'userId',
        select: 'userId name email profileImage',
        populate: { path: 'profileImage' },
      })
      .populate('mediaId')
      .populate({ path: 'createdBy', select: 'name email userId' });
  }

  public async update(
    id: string,
    data: {
      title?: string;
      message?: string;
      redirectUrl?: string;
      status?: 'active' | 'inactive';
      mediaType?: 'image' | 'video' | 'none';
      mediaId?: string;
    }
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('Invalid announcement ID');
    const announcement = await Announcement.findById(id);
    if (!announcement) throw new Error('Announcement not found');

    if (data.title !== undefined) announcement.title = data.title;
    if (data.message !== undefined) announcement.message = data.message;
    if (data.redirectUrl !== undefined) announcement.redirectUrl = data.redirectUrl;
    if (data.status === 'active' || data.status === 'inactive') announcement.status = data.status;
    if (data.mediaType) announcement.mediaType = data.mediaType;
    if (data.mediaId !== undefined) {
      announcement.mediaId = data.mediaId
        ? new mongoose.Types.ObjectId(data.mediaId)
        : undefined;
    }

    await announcement.save();
    return Announcement.findById(id)
      .populate({
        path: 'userId',
        select: 'userId name email profileImage',
        populate: { path: 'profileImage' },
      })
      .populate('mediaId')
      .populate({ path: 'createdBy', select: 'name email userId' });
  }

  public async delete(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('Invalid announcement ID');
    const announcement = await Announcement.findByIdAndDelete(id);
    if (!announcement) throw new Error('Announcement not found');
    return { deleted: true };
  }
}
