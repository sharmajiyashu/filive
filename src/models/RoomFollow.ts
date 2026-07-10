import mongoose, { Schema, Document } from 'mongoose';

export interface IRoomFollow extends Document {
  userId: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RoomFollowSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  },
  {
    timestamps: true,
  }
);

// Ensure a user can only follow a specific room once
RoomFollowSchema.index({ userId: 1, roomId: 1 }, { unique: true });
RoomFollowSchema.index({ roomId: 1 });

export default mongoose.model<IRoomFollow>('RoomFollow', RoomFollowSchema);
