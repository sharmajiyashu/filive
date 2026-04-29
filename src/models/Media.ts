import mongoose, { Schema, Document } from 'mongoose';

export interface IMedia extends Document {
  url: string;
  mimetype: string;
  type: string;
  size?: number;
  width?: number;
  height?: number;
  createdAt: Date;
  updatedAt: Date;
}

const MediaSchema: Schema = new Schema(
  {
    url: { type: String, required: true },
    mimetype: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['image', 'video', 'audio', 'document', 'other', 'gif', 'sticker'], 
      required: true 
    },
    size: { type: Number },
    width: { type: Number },
    height: { type: Number },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IMedia>('Media', MediaSchema);
