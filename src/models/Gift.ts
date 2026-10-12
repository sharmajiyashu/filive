import mongoose, { Schema, Document } from 'mongoose';

export interface IGift extends Document {
  name: string;
  type: mongoose.Types.ObjectId; // References GiftType
  price: number;
  media: mongoose.Types.ObjectId; // Image/GIF/Sticker
  banner?: mongoose.Types.ObjectId; // References Banner
  isActive: boolean;
  showInAllLiveStreams: boolean;
  isComboEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GiftSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    type: { type: Schema.Types.ObjectId, ref: 'GiftType', required: true },
    price: { type: Number, required: true, min: 0 },
    media: { type: Schema.Types.ObjectId, ref: 'Media', required: true },
    banner: { type: Schema.Types.ObjectId, ref: 'Banner', default: null },
    isActive: { type: Boolean, default: true },
    showInAllLiveStreams: { type: Boolean, default: false },
    isComboEnabled: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IGift>('Gift', GiftSchema);
