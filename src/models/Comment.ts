import mongoose, { Schema, Document } from 'mongoose';

export interface IComment extends Document {
  userId: mongoose.Types.ObjectId;
  storyId: mongoose.Types.ObjectId;
  content: string;
  likesCount: number;
  parentCommentId?: mongoose.Types.ObjectId;
  replyToUserId?: mongoose.Types.ObjectId;
  repliesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    storyId: { type: Schema.Types.ObjectId, ref: 'Story', required: true },
    content: { type: String, required: true },
    likesCount: { type: Number, default: 0 },
    parentCommentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
    replyToUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    repliesCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

CommentSchema.index({ storyId: 1, parentCommentId: 1, createdAt: -1 });

export default mongoose.model<IComment>('Comment', CommentSchema);
