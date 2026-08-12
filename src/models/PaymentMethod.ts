import mongoose, { Schema, Document } from 'mongoose';

export type PaymentGatewayKey = 'razorpay' | 'pandapay';
export type PaymentTargetAudience = 'all' | 'user' | 'seller';

export interface IPaymentMethod extends Document {
  gateway: PaymentGatewayKey;
  displayName: string;
  countries: string[];
  targetAudience: PaymentTargetAudience;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentMethodSchema: Schema = new Schema(
  {
    gateway: {
      type: String,
      enum: ['razorpay', 'pandapay'],
      required: true,
      unique: true,
    },
    displayName: { type: String, required: true },
    countries: [{ type: String, required: true }],
    targetAudience: {
      type: String,
      enum: ['all', 'user', 'seller'],
      default: 'all',
    },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IPaymentMethod>('PaymentMethod', PaymentMethodSchema);
