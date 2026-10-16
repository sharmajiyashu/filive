import mongoose, { Document, Schema } from 'mongoose';

export interface IBannedDevice extends Document {
  deviceId: string;
  reason?: string;
  bannedByUserId?: mongoose.Types.ObjectId;
  bannedByAdminId?: mongoose.Types.ObjectId;
  deviceModel?: string;
  deviceType?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BannedDeviceSchema: Schema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true, index: true, trim: true },
    reason: { type: String, default: 'Device banned by Admin' },
    bannedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    bannedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
    deviceModel: { type: String },
    deviceType: { type: String },
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true,
  }
);

export const BannedDevice = mongoose.model<IBannedDevice>('BannedDevice', BannedDeviceSchema);
