import mongoose, { Schema, Document } from 'mongoose';

export interface IRoomTheme extends Document {
  name: string;
  media: mongoose.Types.ObjectId; // Background Image
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RoomThemeSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    media: { type: Schema.Types.ObjectId, ref: 'Media', required: true },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IRoomTheme>('RoomTheme', RoomThemeSchema);
