import mongoose, { Schema, Document } from 'mongoose';

export interface ISocialLink extends Document {
  name: string;
  platformKey: string;
  icon: string;
  handle: string;
  url: string;
  actionText: string;
  color: string;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SocialLinkSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    platformKey: { type: String, default: 'custom', trim: true },
    icon: { type: String, default: '', trim: true },
    handle: { type: String, default: '', trim: true },
    url: { type: String, required: true, trim: true },
    actionText: { type: String, default: 'FOLLOW', trim: true },
    color: { type: String, default: '#F905B2', trim: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true,
  }
);

SocialLinkSchema.index({ order: 1, createdAt: 1 });

export default mongoose.model<ISocialLink>('SocialLink', SocialLinkSchema);
