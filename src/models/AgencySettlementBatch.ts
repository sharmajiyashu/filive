import mongoose, { Schema, Document } from 'mongoose';

export interface IAgencySettlementItem {
  agencyId: mongoose.Types.ObjectId;
  agencyName: string;
  agencyCode: string;
  ownerUserId: mongoose.Types.ObjectId;
  ownerNumericId?: number;
  hostCount: number;
  eligibleBeans: number;
  slabId?: mongoose.Types.ObjectId;
  slabName?: string;
  commissionRate: number;
  calculatedCommission: number;
  adjustmentAmount: number;
  adjustmentReason?: string;
  finalCommission: number;
  status: 'pending' | 'approved' | 'settled' | 'failed';
  walletTransactionId?: string;
  failureReason?: string;
  retryCount: number;
  settledAt?: Date;
}

export interface IAgencySettlementBatch extends Document {
  batchId: string; // e.g. BATCH-2026-W45
  cycleStart: Date;
  cycleEnd: Date;
  settlementDay: number;
  settlementTime: string;
  status: 'draft' | 'preview' | 'pending_approval' | 'approved' | 'settled' | 'failed' | 'partially_settled';
  totalAgencies: number;
  totalEligibleBeans: number;
  totalCommission: number;
  commissionUnit: string;
  approvedBy?: mongoose.Types.ObjectId;
  approvedByName?: string;
  approvedAt?: Date;
  settledAt?: Date;
  notes?: string;
  items: IAgencySettlementItem[];
  createdAt: Date;
  updatedAt: Date;
}

const AgencySettlementItemSchema: Schema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    agencyName: { type: String, required: true },
    agencyCode: { type: String },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ownerNumericId: { type: Number },
    hostCount: { type: Number, default: 0 },
    eligibleBeans: { type: Number, default: 0 },
    slabId: { type: Schema.Types.ObjectId, ref: 'CommissionSlab' },
    slabName: { type: String },
    commissionRate: { type: Number, default: 0 },
    calculatedCommission: { type: Number, default: 0 },
    adjustmentAmount: { type: Number, default: 0 },
    adjustmentReason: { type: String },
    finalCommission: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'settled', 'failed'],
      default: 'pending',
    },
    walletTransactionId: { type: String },
    failureReason: { type: String },
    retryCount: { type: Number, default: 0 },
    settledAt: { type: Date },
  },
  { _id: false }
);

const AgencySettlementBatchSchema: Schema = new Schema(
  {
    batchId: { type: String, required: true, unique: true },
    cycleStart: { type: Date, required: true },
    cycleEnd: { type: Date, required: true },
    settlementDay: { type: Number, default: 3 },
    settlementTime: { type: String, default: '12:00' },
    status: {
      type: String,
      enum: ['draft', 'preview', 'pending_approval', 'approved', 'settled', 'failed', 'partially_settled'],
      default: 'preview',
    },
    totalAgencies: { type: Number, default: 0 },
    totalEligibleBeans: { type: Number, default: 0 },
    totalCommission: { type: Number, default: 0 },
    commissionUnit: { type: String, default: 'beans' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
    approvedByName: { type: String },
    approvedAt: { type: Date },
    settledAt: { type: Date },
    notes: { type: String },
    items: [AgencySettlementItemSchema],
  },
  { timestamps: true }
);

AgencySettlementBatchSchema.index({ cycleStart: -1 });
AgencySettlementBatchSchema.index({ status: 1 });

export default mongoose.model<IAgencySettlementBatch>('AgencySettlementBatch', AgencySettlementBatchSchema);

