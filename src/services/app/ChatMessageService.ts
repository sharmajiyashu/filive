import { Service, Inject, Container } from 'typedi';
import mongoose from 'mongoose';
import Chat from '../../models/Chat';
import Message, {
  IAgencyHostInviteMetadata,
  formatAgencyHostInviteMessage,
  toInviteFlag,
} from '../../models/Message';
import User from '../../models/User';
import { CloudinaryService } from '../common/CloudinaryService';
import { MediaService } from '../common/MediaService';
import { FirebasePushService } from '../common/FirebasePushService';
import { MediaType } from '../../constants/enum';

@Service()
export class ChatMessageService {
  constructor(
    @Inject() private cloudinaryService: CloudinaryService,
    @Inject() private mediaService: MediaService,
    @Inject() private pushService: FirebasePushService,
  ) {}

  private emitSocketEvent(event: string, room: string, payload: unknown) {
    try {
      const io = Container.get('socket') as { to: (room: string) => { emit: (event: string, payload: unknown) => void } };
      io.to(room).emit(event, payload);
    } catch {
      // Socket server not available
    }
  }

  private async populateMessage(messageId: mongoose.Types.ObjectId) {
    const message = await Message.findById(messageId)
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

    return message ? formatAgencyHostInviteMessage(message) : null;
  }

  async createAgencyHostInviteMessage(
    senderId: string,
    chatId: string,
    payload: {
      text: string;
      agencyHostRequestId: string;
      agencyId: string;
      agencyName: string;
    }
  ) {
    const chatObjectId = new mongoose.Types.ObjectId(chatId);
    const senderObjectId = new mongoose.Types.ObjectId(senderId);

    const chat = await Chat.findOne({
      _id: chatObjectId,
      'participants.userId': senderObjectId
    });

    if (!chat) {
      throw new Error('Not a participant of this chat');
    }

    const metadata: IAgencyHostInviteMetadata = {
      type: 'agency_host_invite',
      agencyHostRequestId: payload.agencyHostRequestId,
      agencyId: payload.agencyId,
      agencyName: payload.agencyName,
      status: 'PENDING',
      flag: 'pending',
      isOpened: false,
      isVerified: false,
    };

    const message = await Message.create({
      chatId: chatObjectId,
      senderId: senderObjectId,
      type: 'agency_host_invite',
      text: payload.text,
      metadata,
      seenBy: [{ userId: senderObjectId, seenAt: new Date() }],
      reactions: [],
    });

    const populatedMessage = await this.populateMessage(message._id as mongoose.Types.ObjectId);

    const otherParticipants = chat.participants.filter(
      (p) => p.userId && p.userId.toString() !== senderId
    );

    const sender = await User.findById(senderId).select('name email');
    const senderName = sender?.name || sender?.email || 'Agency';

    for (const participant of otherParticipants) {
      const targetUserId = participant.userId.toString();
      await this.pushService.notifyUser(targetUserId, {
        title: senderName,
        body: payload.text,
        data: {
          type: 'agency_host_invite',
          chatId,
          agencyHostRequestId: payload.agencyHostRequestId,
          agencyId: payload.agencyId,
        },
      });
      this.emitSocketEvent('new_message', `user_${targetUserId}`, populatedMessage);
    }

    this.emitSocketEvent('new_message', `chat_${chatId}`, populatedMessage);
    await Chat.findByIdAndUpdate(chatId, { updatedAt: new Date() });

    return populatedMessage;
  }

  async createSystemChatMessage(senderId: string, chatId: string, text: string) {
    const chatObjectId = new mongoose.Types.ObjectId(chatId);
    const senderObjectId = new mongoose.Types.ObjectId(senderId);

    const chat = await Chat.findOne({
      _id: chatObjectId,
      'participants.userId': senderObjectId,
    });

    if (!chat) {
      throw new Error('Not a participant of this chat');
    }

    const message = await Message.create({
      chatId: chatObjectId,
      senderId: senderObjectId,
      type: 'system',
      text,
      seenBy: [{ userId: senderObjectId, seenAt: new Date() }],
      reactions: [],
    });

    const populatedMessage = await this.populateMessage(message._id as mongoose.Types.ObjectId);
    this.emitSocketEvent('new_message', `chat_${chatId}`, populatedMessage);

    for (const participant of chat.participants) {
      if (participant.userId) {
        this.emitSocketEvent('new_message', `user_${participant.userId.toString()}`, populatedMessage);
      }
    }

    await Chat.findByIdAndUpdate(chatId, { updatedAt: new Date() });
    return populatedMessage;
  }

  async findAgencyHostInviteMessage(agencyHostRequestId: string, messageId?: string) {
    if (messageId) {
      const byId = await Message.findOne({
        _id: messageId,
        type: 'agency_host_invite',
        deletedAt: { $exists: false },
      });
      if (byId) return byId;
    }

    return Message.findOne({
      type: 'agency_host_invite',
      'metadata.agencyHostRequestId': agencyHostRequestId,
      deletedAt: { $exists: false },
    }).sort({ createdAt: -1 });
  }

  private emitInviteResponseEvents(
    chat: (mongoose.Document & { participants: { userId?: mongoose.Types.ObjectId }[] }) | null,
    chatId: string,
    payload: {
      messageId: string;
      status: 'ACCEPTED' | 'REJECTED';
      requestId: string;
      message?: unknown;
    }
  ) {
    if (!chat) return;

    const eventPayload = {
      messageId: payload.messageId,
      chatId,
      type: 'agency_host_invite',
      status: payload.status,
      flag: toInviteFlag(payload.status),
      requestId: payload.requestId,
      message: payload.message ?? null,
    };

    for (const participant of chat.participants) {
      if (participant.userId) {
        const room = `user_${participant.userId.toString()}`;
        if (payload.status === 'REJECTED') {
          this.emitSocketEvent('message_deleted', room, eventPayload);
        } else {
          this.emitSocketEvent('message_updated', room, payload.message);
        }
        this.emitSocketEvent('agency_host_invite_responded', room, eventPayload);
      }
    }

    if (payload.status === 'REJECTED') {
      this.emitSocketEvent('message_deleted', `chat_${chatId}`, eventPayload);
    } else {
      this.emitSocketEvent('message_updated', `chat_${chatId}`, payload.message);
    }
    this.emitSocketEvent('agency_host_invite_responded', `chat_${chatId}`, eventPayload);
  }

  private emitInviteDeletedEvents(
    chat: (mongoose.Document & { participants: { userId?: mongoose.Types.ObjectId }[] }) | null,
    chatId: string,
    payload: { messageId: string; requestId: string }
  ) {
    if (!chat) return;

    const eventPayload = {
      messageId: payload.messageId,
      chatId,
      type: 'agency_host_invite',
      requestId: payload.requestId,
    };

    for (const participant of chat.participants) {
      if (participant.userId) {
        const room = `user_${participant.userId.toString()}`;
        this.emitSocketEvent('message_deleted', room, eventPayload);
        this.emitSocketEvent('agency_host_invite_deleted', room, eventPayload);
      }
    }

    this.emitSocketEvent('message_deleted', `chat_${chatId}`, eventPayload);
    this.emitSocketEvent('agency_host_invite_deleted', `chat_${chatId}`, eventPayload);
  }

  async deleteAgencyHostInviteMessage(messageId: string) {
    const messageObjectId = new mongoose.Types.ObjectId(messageId);
    const message = await Message.findById(messageObjectId);

    if (!message || message.type !== 'agency_host_invite' || !message.metadata) {
      throw new Error('Host invite message not found');
    }

    const metadata = message.metadata as IAgencyHostInviteMetadata;
    if (metadata.status !== 'PENDING') {
      throw new Error('Host invite already responded');
    }

    const chatId = message.chatId.toString();
    const chat = await Chat.findById(message.chatId);

    await Message.findByIdAndDelete(messageObjectId);

    this.emitInviteDeletedEvents(chat, chatId, {
      messageId,
      requestId: metadata.agencyHostRequestId,
    });

    await Chat.findByIdAndUpdate(chatId, { updatedAt: new Date() });
    return { action: 'deleted' as const, messageId, chatId };
  }

  async updateAgencyHostInviteStatus(
    messageId: string,
    status: 'ACCEPTED' | 'REJECTED',
    responseText: string,
    _responderId: string
  ) {
    const messageObjectId = new mongoose.Types.ObjectId(messageId);
    const message = await Message.findById(messageObjectId);

    if (!message || message.type !== 'agency_host_invite' || !message.metadata) {
      throw new Error('Host invite message not found');
    }

    const metadata = { ...(message.metadata as IAgencyHostInviteMetadata) };
    if (metadata.status !== 'PENDING') {
      throw new Error('Host invite already responded');
    }

    const chatId = message.chatId.toString();
    const chat = await Chat.findById(message.chatId);
    metadata.status = status;
    metadata.flag = toInviteFlag(status);

    if (status === 'REJECTED') {
      await Message.findByIdAndDelete(messageObjectId);

      this.emitInviteResponseEvents(chat, chatId, {
        messageId,
        status,
        requestId: metadata.agencyHostRequestId,
      });

      await Chat.findByIdAndUpdate(chatId, { updatedAt: new Date() });
      return { action: 'deleted' as const, messageId, chatId, status };
    }

    message.set('metadata', metadata);
    message.markModified('metadata');
    message.text = responseText;
    await message.save();

    const populatedMessage = await this.populateMessage(messageObjectId);

    this.emitInviteResponseEvents(chat, chatId, {
      messageId,
      status,
      requestId: metadata.agencyHostRequestId,
      message: populatedMessage,
    });

    await Chat.findByIdAndUpdate(chatId, { updatedAt: new Date() });
    return { action: 'updated' as const, messageId, chatId, status, message: populatedMessage };
  }

  async syncAgencyHostInviteFlags(
    messageId: string,
    flags: { isOpened?: boolean; isVerified?: boolean }
  ) {
    const messageObjectId = new mongoose.Types.ObjectId(messageId);
    const message = await Message.findById(messageObjectId);

    if (!message || message.type !== 'agency_host_invite' || !message.metadata) {
      throw new Error('Host invite message not found');
    }

    const metadata = { ...(message.metadata as IAgencyHostInviteMetadata) };

    if (flags.isOpened) {
      metadata.isOpened = true;
      metadata.openedAt = new Date().toISOString();
    }

    if (flags.isVerified) {
      metadata.isVerified = true;
      metadata.verifiedAt = new Date().toISOString();
    }

    message.set('metadata', metadata);
    message.markModified('metadata');
    await message.save();

    const populatedMessage = await this.populateMessage(messageObjectId);
    const chatId = message.chatId.toString();
    const chat = await Chat.findById(message.chatId);

    if (chat) {
      for (const participant of chat.participants) {
        if (participant.userId) {
          this.emitSocketEvent('message_updated', `user_${participant.userId.toString()}`, populatedMessage);
        }
      }
      this.emitSocketEvent('message_updated', `chat_${chatId}`, populatedMessage);
    }

    return populatedMessage;
  }

  async getConversation(userId: string, chatId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const chatObjectId = new mongoose.Types.ObjectId(chatId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const chat = await Chat.findOne({
      _id: chatObjectId,
      'participants.userId': userObjectId,
    });

    if (!chat) {
      throw new Error('Chat conversation not found or access denied');
    }

    const total = await Message.countDocuments({ chatId: chatObjectId, deletedAt: { $exists: false } });
    const totalPages = Math.ceil(total / limit);

    const messages = await Message.find({ chatId: chatObjectId, deletedAt: { $exists: false } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
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

    await this.markChatAsRead(userId, chatId);

    return {
      data: messages.map((msg) => formatAgencyHostInviteMessage(msg)),
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  async createMessage(
    userId: string,
    data: { chatId: string; message?: string; replyToId?: string },
    attachments?: Express.Multer.File[]
  ) {
    const chatObjectId = new mongoose.Types.ObjectId(data.chatId);
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const chat = await Chat.findOne({
      _id: chatObjectId,
      'participants.userId': userObjectId
    });

    if (!chat) {
      throw new Error('Not a participant of this chat');
    }

    const mediaIds: mongoose.Types.ObjectId[] = [];
    let messageType: 'text' | 'image' | 'video' | 'file' = 'text';

    if (attachments && attachments.length > 0) {
      for (const file of attachments) {
        const type = file.mimetype.startsWith('video/') ? MediaType.video : MediaType.image;
        const uploadResults = await this.cloudinaryService.uploadMedia(
          type,
          [file],
          `chat/${data.chatId}`
        );

        if (uploadResults && uploadResults.length > 0) {
          const res = uploadResults[0];
          const media = await this.mediaService.createMedia({
            url: res.url,
            mimetype: res.mimetype,
            type: res.type,
            size: res.size,
            width: res.width,
            height: res.height
          });
          mediaIds.push(media._id as mongoose.Types.ObjectId);

          if (res.type === MediaType.video) {
            messageType = 'video';
          } else {
            messageType = 'image';
          }
        }
      }
    }

    const message = await Message.create({
      chatId: chatObjectId,
      senderId: userObjectId,
      type: messageType,
      text: data.message,
      replyToId: data.replyToId ? new mongoose.Types.ObjectId(data.replyToId) : undefined,
      medias: mediaIds,
      seenBy: [{ userId: userObjectId, seenAt: new Date() }],
      reactions: []
    });

    const populatedMessage = await Message.findById(message._id)
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

    const otherParticipants = chat.participants.filter(
      (p) => p.userId && p.userId.toString() !== userId
    );

    const sender = await User.findById(userId).select('name email');
    const senderName = sender?.name || sender?.email || 'User';

    for (const participant of otherParticipants) {
      let bodyText = data.message || 'Sent an attachment';
      if (!data.message && mediaIds.length > 0) {
        bodyText = mediaIds.length === 1 ? '📷 Sent a photo' : `📷 Sent ${mediaIds.length} photos`;
      }
      await this.pushService.notifyUser(participant.userId.toString(), {
        title: senderName,
        body: bodyText,
        data: {
          type: 'chat',
          chatId: data.chatId
        }
      });
    }

    await Chat.findByIdAndUpdate(data.chatId, { updatedAt: new Date() });

    return populatedMessage;
  }

  async addReaction(userId: string, messageId: string, reaction: string) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const messageObjectId = new mongoose.Types.ObjectId(messageId);

    await Message.updateOne(
      { _id: messageObjectId },
      { $pull: { reactions: { userId: userObjectId } } }
    );

    await Message.updateOne(
      { _id: messageObjectId },
      { $push: { reactions: { userId: userObjectId, reaction } } }
    );
  }

  async removeReaction(userId: string, messageId: string, reaction: string) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const messageObjectId = new mongoose.Types.ObjectId(messageId);

    await Message.updateOne(
      { _id: messageObjectId },
      { $pull: { reactions: { userId: userObjectId, reaction } } }
    );
  }

  async markAsRead(userId: string, messageId: string) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const messageObjectId = new mongoose.Types.ObjectId(messageId);

    const alreadySeen = await Message.findOne({
      _id: messageObjectId,
      'seenBy.userId': userObjectId
    });

    if (!alreadySeen) {
      await Message.updateOne(
        { _id: messageObjectId },
        { $push: { seenBy: { userId: userObjectId, seenAt: new Date() } } }
      );
    }
  }

  async markChatAsRead(userId: string, chatId: string) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const chatObjectId = new mongoose.Types.ObjectId(chatId);

    await Message.updateMany(
      {
        chatId: chatObjectId,
        senderId: { $ne: userObjectId },
        'seenBy.userId': { $ne: userObjectId }
      },
      {
        $push: { seenBy: { userId: userObjectId, seenAt: new Date() } }
      }
    );

    await Chat.updateOne(
      { _id: chatObjectId, 'participants.userId': userObjectId },
      { $set: { 'participants.$.lastSeenAt': new Date() } }
    );
  }

  async deleteMessage(userId: string, messageId: string) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const messageObjectId = new mongoose.Types.ObjectId(messageId);

    const message = await Message.findById(messageObjectId);
    if (!message) {
      throw new Error('Message not found');
    }

    const chat = await Chat.findOne({
      _id: message.chatId,
      'participants.userId': userObjectId
    });

    if (!chat) {
      throw new Error('Chat access denied');
    }

    const participantInfo = chat.participants.find(p => p.userId && p.userId.toString() === userId);
    const isSender = message.senderId.toString() === userId;
    const isAdmin = participantInfo?.role === 'admin';

    if (!isSender && !isAdmin) {
      throw new Error('Not authorized to delete this message');
    }

    message.deletedAt = new Date();
    await message.save();

    return { message: 'Message deleted successfully' };
  }
}
