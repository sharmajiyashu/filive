import mongoose, { Schema, Document } from 'mongoose';

export interface ILiveBan extends Document {
  userId: mongoose.Types.ObjectId;
  reason: string;
  bannedBy: mongoose.Types.ObjectId;
  banType: 'permanent' | 'temporary';
  expiresAt?: Date;
  status: 'active' | 'expired' | 'lifted';
  createdAt: Date;
  updatedAt: Date;
}

const LiveBanSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: { type: String, required: true, default: 'Banned from live streaming' },
    bannedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    banType: { type: String, enum: ['permanent', 'temporary'], default: 'permanent' },
    expiresAt: { type: Date },
    status: { type: String, enum: ['active', 'expired', 'lifted'], default: 'active', index: true },
  },
  { timestamps: true }
);

LiveBanSchema.index({ userId: 1, status: 1 });

export default mongoose.model<ILiveBan>('LiveBan', LiveBanSchema);
