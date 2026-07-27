import mongoose, { Document, Schema } from 'mongoose';

export interface IMusic extends Document {
  title: string;
  artist?: string;
  url: string; // URL to the audio file
  coverImage?: string; // URL to the cover image
  duration?: number; // Duration in seconds
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MusicSchema: Schema = new Schema(
  {
    title: { type: String, required: true },
    artist: { type: String },
    url: { type: String, required: true },
    coverImage: { type: String },
    duration: { type: Number },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<IMusic>('Music', MusicSchema);
