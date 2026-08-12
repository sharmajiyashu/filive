import mongoose, { Schema, Document } from 'mongoose';

export interface IAdminNotification extends Document {
  type: string;
  title: string;
  message: string;
  meta?: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AdminNotificationSchema: Schema = new Schema(
  {
    type: { type: String, required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    meta: { type: Schema.Types.Mixed },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export default mongoose.model<IAdminNotification>('AdminNotification', AdminNotificationSchema);
