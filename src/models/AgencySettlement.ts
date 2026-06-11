import mongoose, { Schema, Document } from 'mongoose';

export interface IAgencySettlement extends Document {
  agencyId: mongoose.Types.ObjectId;
  ownerUserId: mongoose.Types.ObjectId;
  amount: number;
  commissionRate: number;
  hostEarningsTotal: number;
  periodStart: Date;
  periodEnd: Date;
  type: 'auto' | 'manual';
  status: 'completed' | 'failed';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AgencySettlementSchema: Schema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    commissionRate: { type: Number, required: true },
    hostEarningsTotal: { type: Number, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    type: { type: String, enum: ['auto', 'manual'], required: true },
    status: { type: String, enum: ['completed', 'failed'], default: 'completed' },
    notes: { type: String },
  },
  { timestamps: true }
);

AgencySettlementSchema.index({ agencyId: 1, createdAt: -1 });

export default mongoose.model<IAgencySettlement>('AgencySettlement', AgencySettlementSchema);
