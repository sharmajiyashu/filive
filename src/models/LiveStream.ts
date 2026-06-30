import mongoose, { Schema, Document } from 'mongoose';

export interface ISeat {
  userId: mongoose.Types.ObjectId;
  seatIndex: number;
}

export interface ILiveStream extends Document {
  hostId: mongoose.Types.ObjectId;
  channelName: string;
  title: string;
  status: 'live' | 'ended';
  token: string;
  viewerCount: number;
  viewers: mongoose.Types.ObjectId[];
  roomType?: 'livestream' | 'party_room';
  partyRoomOption?: 'live' | 'chat';
  roomTheme?: mongoose.Types.ObjectId;
  blockedUsers?: mongoose.Types.ObjectId[];
  seats?: ISeat[];
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
    roomType: { type: String, enum: ['livestream', 'party_room'], default: 'livestream' },
    partyRoomOption: { type: String, enum: ['live', 'chat'], default: 'live' },
    roomTheme: { type: Schema.Types.ObjectId, ref: 'RoomTheme' },
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    seats: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        seatIndex: { type: Number }
      }
    ],
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
