import mongoose, { Schema, Document } from 'mongoose';

export interface ILiveStream extends Document {
  hostId: mongoose.Types.ObjectId;
  channelName: string;
  title: string;
  status: 'live' | 'ended';
  token: string;
  viewerCount: number;
  viewers: mongoose.Types.ObjectId[];
  startedAt: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LiveStreamSchema: Schema = new Schema(
  {
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channelName: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    status: { type: String, enum: ['live', 'ended'], default: 'live' },
    token: { type: String, required: true },
    viewerCount: { type: Number, default: 0 },
    viewers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

// Indexing for faster queries on active livestreams
LiveStreamSchema.index({ status: 1 });
LiveStreamSchema.index({ hostId: 1, status: 1 });

export default mongoose.model<ILiveStream>('LiveStream', LiveStreamSchema);
