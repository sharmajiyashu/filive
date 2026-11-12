import mongoose, { Schema, Document } from 'mongoose';

export interface IAgencyCommissionAdjustment extends Document {
  agencyId: mongoose.Types.ObjectId;
  batchId?: string;
  cycleStart?: Date;
  amount: number; // positive or negative
  reason: string;
  reference?: string;
  adminId?: mongoose.Types.ObjectId;
  adminName?: string;
  status: 'pending' | 'applied' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

const AgencyCommissionAdjustmentSchema: Schema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    batchId: { type: String, index: true },
    cycleStart: { type: Date },
    amount: { type: Number, required: true },
    reason: { type: String, required: true },
    reference: { type: String },
    adminId: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
    adminName: { type: String },
    status: { type: String, enum: ['pending', 'applied', 'cancelled'], default: 'pending' },
  },
  { timestamps: true }
);

AgencyCommissionAdjustmentSchema.index({ agencyId: 1, cycleStart: -1 });

export default mongoose.model<IAgencyCommissionAdjustment>(
  'AgencyCommissionAdjustment',
  AgencyCommissionAdjustmentSchema
);

