import mongoose, { Schema, Document } from 'mongoose';

export interface ISeat {
  _id?: mongoose.Types.ObjectId | string;
  userId?: mongoose.Types.ObjectId;
  seatIndex: number;
  status: 'open' | 'locked' | 'occupied';
  isMuted: boolean;
  occupiedAt?: Date;
}

export interface IRoom extends Document {
  hostId: mongoose.Types.ObjectId;
  roomId?: number;
  channelName: string;
  title: string;
  status: 'live' | 'ended';
  token: string;
  viewerCount: number;
  viewers: mongoose.Types.ObjectId[];
  roomType?: 'livestream' | 'party_room';
  partyRoomOption?: 'live' | 'chat';
  blockedUsers?: mongoose.Types.ObjectId[];
  seats?: ISeat[];
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
    roomId: { type: Number, unique: true, sparse: true },
    channelName: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    status: { type: String, enum: ['live', 'ended'], default: 'live' },
    token: { type: String, required: true },
    viewerCount: { type: Number, default: 0 },
    viewers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    roomType: { type: String, enum: ['livestream', 'party_room'], default: 'livestream' },
    partyRoomOption: { type: String, enum: ['live', 'chat'], default: 'live' },
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    seats: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        seatIndex: { type: Number, required: true },
        status: { type: String, enum: ['open', 'locked', 'occupied'], default: 'open' },
        isMuted: { type: Boolean, default: false },
        occupiedAt: { type: Date }
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

async function generateNextRoomId(): Promise<number> {
  const highestRoom: any = await mongoose.models.Room.findOne({ roomId: { $gte: 10000001, $lte: 99999999 } })
    .sort({ roomId: -1 })
    .lean();

  let nextRoomId = 10000001;
  if (highestRoom && highestRoom.roomId && highestRoom.roomId >= 10000001) {
    nextRoomId = Number(highestRoom.roomId) + 1;
  }

  let unique = false;
  let attempts = 0;
  while (!unique && attempts < 100) {
    const exists = await mongoose.models.Room.findOne({ roomId: nextRoomId });
    if (!exists) {
      unique = true;
    } else {
      nextRoomId++;
    }
    attempts++;
  }

  if (!unique) {
    nextRoomId = Math.floor(10000000 + Math.random() * 90000000);
  }

  return nextRoomId;
}

RoomSchema.pre('save', async function (next) {
  const room = this as any;
  if (!room.roomId) {
    room.roomId = await generateNextRoomId();
  }
  next();
});

export default mongoose.model<IRoom>('Room', RoomSchema);
