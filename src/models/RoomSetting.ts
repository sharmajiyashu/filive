import mongoose, { Schema, Document } from 'mongoose';

export interface IRoomSetting extends Document {
  hostId: mongoose.Types.ObjectId;
  maxSeats: number;
  admins: mongoose.Types.ObjectId[];
  roomTheme?: mongoose.Types.ObjectId;
  announcement?: string;
  muteAllSeats?: boolean;
  gameId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RoomSettingSchema: Schema = new Schema(
  {
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    maxSeats: { type: Number, default: 4 },
    admins: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    roomTheme: { type: Schema.Types.ObjectId, ref: 'RoomTheme' },
    announcement: { type: String, default: '' },
    muteAllSeats: { type: Boolean, default: false },
    gameId: { type: Schema.Types.ObjectId, ref: 'Game' },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IRoomSetting>('RoomSetting', RoomSettingSchema);
