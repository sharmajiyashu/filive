import mongoose, { Schema, Document } from 'mongoose';

export interface IAnnouncement extends Document {
  title: string;
  message: string;
  redirectUrl?: string;
  audienceType: 'all' | 'specific_user';
  userId?: mongoose.Types.ObjectId;
  mediaType: 'image' | 'video' | 'none';
  mediaId?: mongoose.Types.ObjectId;
  status: 'active' | 'inactive';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AnnouncementSchema: Schema = new Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    redirectUrl: { type: String },
    audienceType: { type: String, enum: ['all', 'specific_user'], default: 'all', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    mediaType: { type: String, enum: ['image', 'video', 'none'], default: 'none' },
    mediaId: { type: Schema.Types.ObjectId, ref: 'Media' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export default mongoose.model<IAnnouncement>('Announcement', AnnouncementSchema);
