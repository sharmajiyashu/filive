import mongoose, { Schema, Document } from 'mongoose';

export interface ISeat {
  _id?: mongoose.Types.ObjectId | string;
  userId?: mongoose.Types.ObjectId;
  seatIndex: number;
  status: 'open' | 'locked' | 'occupied';
  isMuted: boolean;
}

export interface IRoom extends Document {
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
  announcement?: string;
  startedAt: Date;
  endedAt?: Date;
  joinedUsers?: mongoose.Types.ObjectId[];
  commentCount?: number;
  totalGiftRevenue?: number;
  roomFollowerCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

const RoomSchema: Schema = new Schema(
  {
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channelName: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    announcement: { type: String, default: '' },
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
        seatIndex: { type: Number, required: true },
        status: { type: String, enum: ['open', 'locked', 'occupied'], default: 'open' },
        isMuted: { type: Boolean, default: false }
      }
    ],
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
    joinedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    commentCount: { type: Number, default: 0 },
    totalGiftRevenue: { type: Number, default: 0 },
    roomFollowerCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

// Indexing for faster queries on active rooms
RoomSchema.index({ status: 1 });
RoomSchema.index({ hostId: 1, status: 1 });

export default mongoose.model<IRoom>('Room', RoomSchema);
