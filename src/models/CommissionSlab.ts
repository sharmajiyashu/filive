import mongoose, { Schema, Document } from 'mongoose';

export interface ICommissionSlab extends Document {
  name: string;
  minEarnings: number;
  maxEarnings?: number | null;
  percentage: number;
  effectiveFrom?: Date;
  isUnlimited?: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const CommissionSlabSchema: Schema = new Schema(
  {
    name: { type: String, default: 'Level 1' },
    minEarnings: { type: Number, required: true, min: 0 },
    maxEarnings: { type: Number, default: null },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    effectiveFrom: { type: Date, default: () => new Date() },
    isUnlimited: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

CommissionSlabSchema.index({ sortOrder: 1, minEarnings: 1 });
CommissionSlabSchema.index({ isActive: 1, minEarnings: 1 });

export default mongoose.model<ICommissionSlab>('CommissionSlab', CommissionSlabSchema);
