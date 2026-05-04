import mongoose, { Schema, Document } from 'mongoose';

export interface IFriendRequest extends Document {
  senderId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const FriendRequestSchema: Schema = new Schema(
  {
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IFriendRequest>('FriendRequest', FriendRequestSchema);
