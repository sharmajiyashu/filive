import mongoose, { Schema, Document } from 'mongoose';

export interface IFollow extends Document {
  followerId: mongoose.Types.ObjectId;
  followingId: mongoose.Types.ObjectId;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const FollowSchema: Schema = new Schema(
  {
    followerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    followingId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  },
  {
    timestamps: true,
  }
);

FollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });
FollowSchema.index({ followingId: 1, status: 1 });
FollowSchema.index({ followerId: 1, status: 1 });

export default mongoose.model<IFollow>('Follow', FollowSchema);
