import mongoose, { Schema, Document } from 'mongoose';

export interface IHashtag extends Document {
  name: string;
  description?: string;
  image?: mongoose.Types.ObjectId;
  usageCount: number;
  isTrending: boolean;
  isActive: boolean;
  order: number;
  category: string;
  createdAt: Date;
  updatedAt: Date;
}

const HashtagSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    image: {
      type: Schema.Types.ObjectId,
      ref: 'Media',
    },
    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isTrending: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    category: {
      type: String,
      default: 'general',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

HashtagSchema.index({ name: 1 }, { unique: true });
HashtagSchema.index({ isActive: 1, isTrending: 1, order: 1, usageCount: -1 });

export default mongoose.model<IHashtag>('Hashtag', HashtagSchema);
