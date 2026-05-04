import mongoose, { Schema, Document } from 'mongoose';

export interface IComment extends Document {
  userId: mongoose.Types.ObjectId;
  storyId: mongoose.Types.ObjectId;
  content: string;
  likesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    storyId: { type: Schema.Types.ObjectId, ref: 'Story', required: true },
    content: { type: String, required: true },
    likesCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IComment>('Comment', CommentSchema);
