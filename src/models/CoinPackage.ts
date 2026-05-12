import mongoose, { Schema, Document } from 'mongoose';

export interface ICoinPackage extends Document {
  name: string;
  coins: number;
  price: number;
  description?: string;
  image?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CoinPackageSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    coins: { type: Number, required: true },
    price: { type: Number, required: true },
    description: { type: String },
    image: { type: String },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ICoinPackage>('CoinPackage', CoinPackageSchema);
