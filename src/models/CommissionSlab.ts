import mongoose, { Schema, Document } from 'mongoose';

export interface ICommissionSlab extends Document {
  minEarnings: number;
  maxEarnings?: number | null;
  percentage: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const CommissionSlabSchema: Schema = new Schema(
  {
    minEarnings: { type: Number, required: true, min: 0 },
    maxEarnings: { type: Number, default: null },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<ICommissionSlab>('CommissionSlab', CommissionSlabSchema);
