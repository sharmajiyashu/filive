import mongoose, { Schema, Document } from 'mongoose';

export const BANNER_TYPES = ['splash', 'home', 'gift', 'game'] as const;
export type BannerType = (typeof BANNER_TYPES)[number];

export interface IBanner extends Document {
  type: BannerType;
  image: mongoose.Types.ObjectId;
  redirectUrl?: string;
  route?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const BannerSchema: Schema = new Schema(
  {
    type: { type: String, enum: BANNER_TYPES, required: true, index: true },
    image: { type: Schema.Types.ObjectId, ref: 'Media', required: true },
    redirectUrl: { type: String, default: '' },
    route: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

BannerSchema.index({ type: 1, sortOrder: 1, createdAt: -1 });

export default mongoose.model<IBanner>('Banner', BannerSchema);
