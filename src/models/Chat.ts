import mongoose, { Schema, Document } from 'mongoose';

export interface IChatParticipant {
  userId: mongoose.Types.ObjectId;
  role: 'admin' | 'member' | 'moderator';
  isMuted: boolean;
  isPinned: boolean;
  lastSeenAt?: Date;
  archiveAt?: Date;
  joinedAt: Date;
}

export interface IChat extends Document {
  type: 'private' | 'group';
  name?: string;
  mediaId?: mongoose.Types.ObjectId;
  participants: IChatParticipant[];
  createdAt: Date;
  updatedAt: Date;
}

const ChatParticipantSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['admin', 'member', 'moderator'], default: 'member' },
  isMuted: { type: Boolean, default: false },
  isPinned: { type: Boolean, default: false },
  lastSeenAt: { type: Date },
  archiveAt: { type: Date },
  joinedAt: { type: Date, default: Date.now }
}, { _id: false });

const ChatSchema: Schema = new Schema(
  {
    type: { type: String, enum: ['private', 'group'], default: 'private', required: true },
    name: { type: String, default: '' },
    mediaId: { type: Schema.Types.ObjectId, ref: 'Media' },
    participants: [ChatParticipantSchema]
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IChat>('Chat', ChatSchema);
