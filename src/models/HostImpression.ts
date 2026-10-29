import mongoose, { Schema, Document } from 'mongoose';

export interface IHostImpression extends Document {
  hostId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  feedType: 'live' | 'popular' | 'meet' | 'talk' | 'new';
  rankingPosition: number;
  countryCode?: string;
  convertedToCall: boolean;
  convertedToProfileView: boolean;
  createdAt: Date;
}

const HostImpressionSchema: Schema = new Schema(
  {
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    feedType: {
      type: String,
      enum: ['live', 'popular', 'meet', 'talk', 'new'],
      required: true,
      index: true,
    },
    rankingPosition: { type: Number, required: true },
    countryCode: { type: String, index: true },
    convertedToCall: { type: Boolean, default: false },
    convertedToProfileView: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

HostImpressionSchema.index({ hostId: 1, createdAt: -1 });
HostImpressionSchema.index({ feedType: 1, createdAt: -1 });

export default mongoose.model<IHostImpression>('HostImpression', HostImpressionSchema);
