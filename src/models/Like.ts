import mongoose, { Schema, Document } from 'mongoose';

export interface ILike extends Document {
  userId: mongoose.Types.ObjectId;
  targetId: mongoose.Types.ObjectId;
  targetType: 'Story' | 'Comment';
  createdAt: Date;
  updatedAt: Date;
}

const LikeSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetId: { type: Schema.Types.ObjectId, required: true, refPath: 'targetType' },
    targetType: { type: String, required: true, enum: ['Story', 'Comment'] },
  },
  {
    timestamps: true,
  }
);

LikeSchema.index({ userId: 1, targetId: 1, targetType: 1 }, { unique: true });
LikeSchema.index({ targetId: 1, targetType: 1 });

export default mongoose.model<ILike>('Like', LikeSchema);
