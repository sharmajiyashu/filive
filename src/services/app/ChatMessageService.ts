import { Service, Inject } from 'typedi';
import mongoose from 'mongoose';
import Chat from '../../models/Chat';
import Message from '../../models/Message';
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

    const total = await Message.countDocuments({ chatId: chatObjectId });
    const totalPages = Math.ceil(total / limit);

    const messages = await Message.find({ chatId: chatObjectId })
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
      data: messages,
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
}
