import mongoose, { Schema, Document } from 'mongoose';

export interface IStory extends Document {
  userId: mongoose.Types.ObjectId;
  content: string;
  images: mongoose.Types.ObjectId[];
  tags: string[];
  mentions: mongoose.Types.ObjectId[];
  likesCount: number;
  commentsCount: number;
  isBlocked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StorySchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    images: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    tags: [{ type: String }],
    mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    likesCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    isBlocked: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IStory>('Story', StorySchema);
