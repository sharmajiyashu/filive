import mongoose, { Schema, Document } from 'mongoose';

export interface IGiftType extends Document {
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GiftTypeSchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IGiftType>('GiftType', GiftTypeSchema);
