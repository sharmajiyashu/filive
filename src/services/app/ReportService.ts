import { Service, Container } from 'typedi';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import Report, { IReport, ReportType, ReportPriority } from '../../models/Report';
import Appeal, { IAppeal } from '../../models/Appeal';
import User from '../../models/User';
import Message from '../../models/Message';
import Chat from '../../models/Chat';
import { ChatService } from './ChatService';
import { FirebasePushService } from '../common/FirebasePushService';
import AppLogger from '../../api/loaders/logger';

@Service()
export class ReportService {
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

  /**
   * Helper to send official system messages & push notifications to a user
   */
  public async sendOfficialSystemMessage(userId: string, title: string, text: string, meta: Record<string, any> = {}) {
    try {
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return;

      const sysUser = await this.chatService.resolveSystemUser();
      const systemSenderId = sysUser._id.toString();

      if (userId === systemSenderId) return;

      const chat = await this.chatService.getOrCreateSingleChat(systemSenderId, userId);
      if (!chat) return;

      const message = await Message.create({
        chatId: chat._id,
        senderId: sysUser._id,
        type: 'announcement',
        text,
        metadata: {
          title,
          systemNotificationType: meta.type || 'report_notification',
          ...meta,
        },
        seenBy: [{ userId: sysUser._id, seenAt: new Date() }],
        reactions: [],
      });

      await Chat.findByIdAndUpdate(chat._id, { updatedAt: new Date() });

      const populated = await Message.findById(message._id)
        .populate({
          path: 'senderId',
          select: 'name email profileImage userRole userId',
          populate: { path: 'profileImage' },
        });

      const payload = populated?.toObject ? populated.toObject() : populated;
      this.emitSocketEvent('new_message', `chat_${chat._id}`, payload);
      this.emitSocketEvent('new_message', `user_${userId}`, payload);

      // Send Firebase push notification
      await this.pushService.notifyUser(userId, {
        title,
        body: text,
        data: {
          type: 'report_system_message',
          title,
          ...Object.fromEntries(
            Object.entries(meta).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
          ),
        },
      });
    } catch (err: any) {
      AppLogger.warn(`[ReportService] sendOfficialSystemMessage error for ${userId}: ${err?.message}`);
    }
  }

  /**
   * Generate next unique Report ID like RP-2026-0001
   */
  private async generateReportId(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await Report.countDocuments({});
    const seq = String(count + 1).padStart(4, '0');
    let id = `RP-${year}-${seq}`;

    let exists = await Report.findOne({ reportId: id });
    let increment = 1;
    while (exists) {
      id = `RP-${year}-${String(count + 1 + increment).padStart(4, '0')}`;
      exists = await Report.findOne({ reportId: id });
      increment++;
    }
    return id;
  }

  /**
   * Generate next unique Appeal ID like AP-2026-0001
   */
  private async generateAppealId(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await Appeal.countDocuments({});
    const seq = String(count + 1).padStart(4, '0');
    let id = `AP-${year}-${seq}`;

    let exists = await Appeal.findOne({ appealId: id });
    let increment = 1;
    while (exists) {
      id = `AP-${year}-${String(count + 1 + increment).padStart(4, '0')}`;
      exists = await Appeal.findOne({ appealId: id });
      increment++;
    }
    return id;
  }

  /**
   * Submit a new report from the app
   */
  public async createReport(reporterId: string, data: {
    reportType: ReportType;
    reportedUserId?: string;
    reason: string;
    description?: string;
    targetId?: string;
    postId?: string;
    postMediaUrl?: string;
    postCaption?: string;
    storyId?: string;
    storyMediaUrl?: string;
    storyCaption?: string;
    roomId?: string;
    roomTitle?: string;
    roomType?: string;
    roomChannelName?: string;
    liveHostId?: string;
    messageId?: string;
    messageText?: string;
    messageSenderId?: string;
    chatTranscript?: any[];
    mediaUrls?: string[];
    priority?: ReportPriority;
  }): Promise<IReport> {
    if (!data.reportType) throw new Error('Report type is required');
    if (!data.reason?.trim()) throw new Error('Report reason is required');

    const reportId = await this.generateReportId();

    let resolvedReportedUserId = data.reportedUserId;
    let storyMediaUrl = data.storyMediaUrl;
    let storyCaption = data.storyCaption;
    let roomTitle = data.roomTitle;
    let roomType = data.roomType;
    let roomChannelName = data.roomChannelName;
    let liveHostId = data.liveHostId;
    let messageText = data.messageText;
    let messageSenderId = data.messageSenderId;
    let postMediaUrl = data.postMediaUrl;
    let postCaption = data.postCaption;

    // Auto-enrich Story details if storyId or postId is provided
    const targetStoryId = data.storyId || (data.reportType === 'story' ? (data.postId || data.targetId) : undefined);
    if (targetStoryId && mongoose.Types.ObjectId.isValid(targetStoryId)) {
      try {
        const Story = (await import('../../models/Story')).default;
        const storyDoc = await Story.findById(targetStoryId).populate('image video userId').lean();
        if (storyDoc) {
          if (!resolvedReportedUserId && (storyDoc as any).userId?._id) {
            resolvedReportedUserId = (storyDoc as any).userId._id.toString();
          }
          if (!storyMediaUrl) {
            storyMediaUrl = (storyDoc as any).video?.url || (storyDoc as any).image?.url || (storyDoc as any).mediaUrl || '';
          }
          if (!storyCaption) {
            storyCaption = (storyDoc as any).description || (storyDoc as any).caption || (storyDoc as any).title || '';
          }
        }
      } catch (_) {}
    }

    // Auto-enrich Room details if roomId is provided
    if (data.roomId && mongoose.Types.ObjectId.isValid(data.roomId)) {
      try {
        const Room = (await import('../../models/Room')).default;
        const roomDoc = await Room.findById(data.roomId).lean();
        if (roomDoc) {
          if (!resolvedReportedUserId && (roomDoc as any).hostId) {
            resolvedReportedUserId = (roomDoc as any).hostId.toString();
          }
          if (!roomTitle) roomTitle = (roomDoc as any).title || '';
          if (!roomType) roomType = (roomDoc as any).roomType || '';
          if (!roomChannelName) roomChannelName = (roomDoc as any).channelName || '';
          if (!liveHostId && (roomDoc as any).hostId) liveHostId = (roomDoc as any).hostId.toString();
        }
      } catch (_) {}
    }

    // Auto-enrich Message details if messageId is provided
    if (data.messageId && mongoose.Types.ObjectId.isValid(data.messageId)) {
      try {
        const Message = (await import('../../models/Message')).default;
        const msgDoc = await Message.findById(data.messageId).lean();
        if (msgDoc) {
          if (!resolvedReportedUserId && (msgDoc as any).senderId) {
            resolvedReportedUserId = (msgDoc as any).senderId.toString();
          }
          if (!messageText) messageText = (msgDoc as any).text || '';
          if (!messageSenderId && (msgDoc as any).senderId) {
            messageSenderId = (msgDoc as any).senderId.toString();
          }
        }
      } catch (_) {}
    }

    // Determine complaint group key to identify duplicates / multiple complaints on same target
    let complaintGroupKey = '';
    if (data.reportType === 'story' && targetStoryId) {
      complaintGroupKey = `story:${targetStoryId}`;
    } else if (data.reportType === 'post' && (data.postId || data.targetId)) {
      complaintGroupKey = `post:${data.postId || data.targetId}`;
    } else if ((data.reportType === 'party_room' || data.reportType === 'live_room') && (data.roomId || liveHostId || data.targetId)) {
      complaintGroupKey = `room:${data.roomId || liveHostId || data.targetId}`;
    } else if ((data.reportType === 'message' || data.reportType === 'chat') && data.messageId) {
      complaintGroupKey = `message:${data.messageId}`;
    } else if (data.reportType === 'chat' && resolvedReportedUserId) {
      complaintGroupKey = `chat:${resolvedReportedUserId}`;
    } else if (resolvedReportedUserId) {
      complaintGroupKey = `user:${resolvedReportedUserId}`;
    }

    const report = await Report.create({
      reportId,
      reportType: data.reportType,
      reporterId: new mongoose.Types.ObjectId(reporterId),
      reportedUserId: resolvedReportedUserId ? new mongoose.Types.ObjectId(resolvedReportedUserId) : undefined,
      reason: data.reason.trim(),
      description: data.description?.trim(),
      evidence: {
        targetId: data.targetId,
        postId: data.postId && mongoose.Types.ObjectId.isValid(data.postId) ? new mongoose.Types.ObjectId(data.postId) : undefined,
        postMediaUrl,
        postCaption,
        storyId: targetStoryId && mongoose.Types.ObjectId.isValid(targetStoryId) ? new mongoose.Types.ObjectId(targetStoryId) : undefined,
        storyMediaUrl,
        storyCaption,
        roomId: data.roomId && mongoose.Types.ObjectId.isValid(data.roomId) ? new mongoose.Types.ObjectId(data.roomId) : undefined,
        roomTitle,
        roomType,
        roomChannelName,
        liveHostId: liveHostId && mongoose.Types.ObjectId.isValid(liveHostId) ? new mongoose.Types.ObjectId(liveHostId) : undefined,
        messageId: data.messageId && mongoose.Types.ObjectId.isValid(data.messageId) ? new mongoose.Types.ObjectId(data.messageId) : undefined,
        messageText,
        messageSenderId,
        chatTranscript: data.chatTranscript || [],
        mediaUrls: data.mediaUrls || [],
      },
      status: 'pending',
      priority: data.priority || 'medium',
      complaintGroupKey: complaintGroupKey || undefined,
      actionTaken: 'none',
      actionHistory: [],
    });

    // Send immediate confirmation official system message to the reporter
    await this.sendOfficialSystemMessage(
      reporterId,
      'Report Successfully Submitted',
      "Your report has been submitted successfully. Our moderation team will review it according to Filive's Community Guidelines. Thank you for helping us keep Filive safe.",
      {
        reportId: report.reportId,
        reportType: report.reportType,
        status: 'pending',
      }
    );

    return report;
  }

  /**
   * List reports submitted by the logged in user
   */
  public async getMyReports(userId: string, opts: { page?: number; limit?: number }) {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.max(1, Math.min(50, opts.limit || 10));
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      Report.find({ reporterId: new mongoose.Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: 'reportedUserId', select: 'name userId profileImage' })
        .lean(),
      Report.countDocuments({ reporterId: new mongoose.Types.ObjectId(userId) }),
    ]);

    return {
      reports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Submit an Appeal by a user against an enforcement action
   */
  public async createAppeal(userId: string, data: {
    reportId?: string;
    reason: string;
    explanation: string;
    evidenceUrls?: string[];
  }): Promise<IAppeal> {
    if (!data.reason?.trim() || !data.explanation?.trim()) {
      throw new Error('Reason and detailed explanation are required for appeal');
    }

    let reportObjId: mongoose.Types.ObjectId | undefined;
    if (data.reportId) {
      const rep = await Report.findOne({
        $or: [{ reportId: data.reportId }, { _id: mongoose.Types.ObjectId.isValid(data.reportId) ? data.reportId : null }]
      });
      if (rep) {
        reportObjId = rep._id as mongoose.Types.ObjectId;
      }
    }

    const appealId = await this.generateAppealId();

    const appeal = await Appeal.create({
      appealId,
      reportId: reportObjId,
      userId: new mongoose.Types.ObjectId(userId),
      reason: data.reason.trim(),
      explanation: data.explanation.trim(),
      evidenceUrls: data.evidenceUrls || [],
      status: 'pending',
      outcome: 'none',
    });

    if (reportObjId) {
      await Report.findByIdAndUpdate(reportObjId, { appealId: appeal._id });
    }

    // Send confirmation system message
    await this.sendOfficialSystemMessage(
      userId,
      'Appeal Received',
      `Your appeal (${appeal.appealId}) has been received and is queued for administrative review. We will notify you once a decision is made.`,
      {
        appealId: appeal.appealId,
        status: 'pending',
      }
    );

    return appeal;
  }

  /**
   * Get user's appeals
   */
  public async getMyAppeals(userId: string) {
    return Appeal.find({ userId: new mongoose.Types.ObjectId(userId) })
      .populate('reportId')
      .sort({ createdAt: -1 })
      .lean();
  }
}
