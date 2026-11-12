import mongoose, { Schema, Document } from 'mongoose';

export interface ICoinsellerRankingLog extends Document {
  sellerId?: mongoose.Types.ObjectId;
  sellerName?: string;
  sellerUserId?: number;
  adminId?: mongoose.Types.ObjectId;
  adminName?: string;
  action: 'exclude' | 'restore' | 'update_category' | 'update_settings';
  reason: string;
  details?: any;
  createdAt: Date;
  updatedAt: Date;
}

const CoinsellerRankingLogSchema: Schema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    sellerName: { type: String },
    sellerUserId: { type: Number },
    adminId: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
    adminName: { type: String },
    action: {
      type: String,
      enum: ['exclude', 'restore', 'update_category', 'update_settings'],
      required: true,
      index: true,
    },
    reason: { type: String, required: true },
    details: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
  }
);

CoinsellerRankingLogSchema.index({ sellerId: 1, createdAt: -1 });
CoinsellerRankingLogSchema.index({ createdAt: -1 });

export default mongoose.model<ICoinsellerRankingLog>('CoinsellerRankingLog', CoinsellerRankingLogSchema);

