import mongoose, { Schema, Document } from 'mongoose';

export interface IStory extends Document {
  userId: mongoose.Types.ObjectId;
  content: string;
  images: mongoose.Types.ObjectId[];
  tags: string[];
  likesCount: number;
  commentsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const StorySchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    images: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    tags: [{ type: String }],
    likesCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IStory>('Story', StorySchema);
