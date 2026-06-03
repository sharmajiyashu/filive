import mongoose, { Schema, Document } from 'mongoose';

export interface IStoreItemPrice {
  validity: number;
  validityType: 'days' | 'month' | 'year';
  coins: number;
}

export interface IStoreItem extends Document {
  name: string;
  type: 'entity' | 'frame' | 'chat_bubble' | 'theme' | 'ride';
  media: mongoose.Types.ObjectId;
  priceOptions: IStoreItemPrice[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StoreItemSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['entity', 'frame', 'chat_bubble', 'theme', 'ride'], 
      required: true 
    },
    media: { type: Schema.Types.ObjectId, ref: 'Media', required: true },
    priceOptions: [
      {
        validity: { type: Number, required: true },
        validityType: { type: String, enum: ['days', 'month', 'year'], required: true },
        coins: { type: Number, required: true },
      }
    ],
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IStoreItem>('StoreItem', StoreItemSchema);
