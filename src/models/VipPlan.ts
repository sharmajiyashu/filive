import mongoose, { Schema, Document } from 'mongoose';

export interface IVipPlan extends Document {
  name: string;
  durationMonths: number;
  durationDays: number;
  coinPrice: number;
  discountPercent?: number;
  badgeIcon?: string;
  benefits: string[];
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const VipPlanSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    durationMonths: { type: Number, required: true },
    durationDays: { type: Number, required: true },
    coinPrice: { type: Number, required: true },
    discountPercent: { type: Number, default: 0 },
    badgeIcon: { type: String },
    benefits: {
      type: [String],
      default: [
        'See Profile Visitors',
        'Exclusive VIP Crown & Badge',
        'Special Entrance Effects in Live Rooms',
        'Higher Following & Friend Limits',
        'VIP Customer Support',
      ],
    },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IVipPlan>('VipPlan', VipPlanSchema);
