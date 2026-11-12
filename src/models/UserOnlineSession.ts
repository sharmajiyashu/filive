import mongoose, { Schema, Document } from 'mongoose';

export interface IUserOnlineSession extends Document {
  userId: mongoose.Types.ObjectId;
  startTime: Date;
  endTime?: Date | null;
  lastHeartbeat: Date;
  durationSeconds: number;
  isClosed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserOnlineSessionSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    startTime: { type: Date, required: true, index: true },
    endTime: { type: Date, default: null },
    lastHeartbeat: { type: Date, required: true },
    durationSeconds: { type: Number, default: 0 },
    isClosed: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
  }
);

UserOnlineSessionSchema.index({ userId: 1, startTime: -1 });
UserOnlineSessionSchema.index({ userId: 1, isClosed: 1 });

export default mongoose.model<IUserOnlineSession>('UserOnlineSession', UserOnlineSessionSchema);

