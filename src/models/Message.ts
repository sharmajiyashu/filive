import mongoose, { Schema, Document } from 'mongoose';

export interface IMessageReaction {
  userId: mongoose.Types.ObjectId;
  reaction: string;
}

export interface IMessageSeen {
  userId: mongoose.Types.ObjectId;
  seenAt: Date;
}

export interface IAgencyHostInviteMetadata {
  type: 'agency_host_invite';
  agencyHostRequestId: string;
  agencyId: string;
  agencyName: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}

export interface IMessage extends Document {
  chatId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  type: 'text' | 'image' | 'video' | 'file' | 'system' | 'agency_host_invite';
  text?: string;
  replyToId?: mongoose.Types.ObjectId;
  medias?: mongoose.Types.ObjectId[];
  metadata?: IAgencyHostInviteMetadata | Record<string, unknown>;
  reactions: IMessageReaction[];
  seenBy: IMessageSeen[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const MessageReactionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reaction: { type: String, required: true }
}, { _id: false });

const MessageSeenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  seenAt: { type: Date, default: Date.now }
}, { _id: false });

const MessageSchema: Schema = new Schema(
  {
    chatId: { type: Schema.Types.ObjectId, ref: 'Chat', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['text', 'image', 'video', 'file', 'system', 'agency_host_invite'], default: 'text', required: true },
    text: { type: String },
    replyToId: { type: Schema.Types.ObjectId, ref: 'Message' },
    medias: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    metadata: { type: Schema.Types.Mixed },
    reactions: [MessageReactionSchema],
    seenBy: [MessageSeenSchema],
    deletedAt: { type: Date }
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IMessage>('Message', MessageSchema);
