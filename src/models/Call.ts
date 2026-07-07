import mongoose, { Schema, Document } from 'mongoose';

export interface ICall extends Document {
  callerId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  callType: 'voice' | 'video';
  status: 'initiated' | 'accepted' | 'rejected' | 'ended' | 'missed' | 'busy' | 'cancelled';
  roomId: string;
  agoraToken?: string;
  callerAgoraToken?: string;
  receiverAgoraToken?: string;
  callerAgoraAccountToken?: string;
  receiverAgoraAccountToken?: string;
  duration: number; // in seconds
  coinsDeducted: number;
  coinsEarned: number;
  platformFee: number;
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CallSchema: Schema = new Schema(
  {
    callerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    callType: { type: String, enum: ['voice', 'video'], required: true },
    status: {
      type: String,
      enum: ['initiated', 'accepted', 'rejected', 'ended', 'missed', 'busy', 'cancelled'],
      default: 'initiated',
    },
    roomId: { type: String, required: true },
    agoraToken: { type: String },
    callerAgoraToken: { type: String },
    receiverAgoraToken: { type: String },
    callerAgoraAccountToken: { type: String },
    receiverAgoraAccountToken: { type: String },
    duration: { type: Number, default: 0 },
    coinsDeducted: { type: Number, default: 0 },
    coinsEarned: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    startedAt: { type: Date },
    endedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster lookups
CallSchema.index({ callerId: 1 });
CallSchema.index({ receiverId: 1 });
CallSchema.index({ status: 1 });
CallSchema.index({ roomId: 1 });

export default mongoose.model<ICall>('Call', CallSchema);
