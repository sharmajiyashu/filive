import mongoose, { Schema, Document } from 'mongoose';

export interface IAgencyCommission extends Document {
  agencyId: mongoose.Types.ObjectId;
  hostUserId?: mongoose.Types.ObjectId;
  amount: number;
  commissionRate: number;
  hostEarningsAmount?: number;
  type: 'accrual' | 'settlement' | 'reversal' | 'adjustment';
  status: 'pending' | 'settled' | 'held' | 'reversed';
  cycleStart?: Date;
  cycleEnd?: Date;
  settlementId?: mongoose.Types.ObjectId;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AgencyCommissionSchema: Schema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    hostUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    amount: { type: Number, required: true },
    commissionRate: { type: Number, default: 0 },
    hostEarningsAmount: { type: Number },
    type: {
      type: String,
      enum: ['accrual', 'settlement', 'reversal', 'adjustment'],
      default: 'accrual',
    },
    status: {
      type: String,
      enum: ['pending', 'settled', 'held', 'reversed'],
      default: 'pending',
    },
    cycleStart: { type: Date },
    cycleEnd: { type: Date },
    settlementId: { type: Schema.Types.ObjectId, ref: 'AgencySettlement' },
    description: { type: String },
  },
  { timestamps: true }
);

AgencyCommissionSchema.index({ agencyId: 1, createdAt: -1 });
AgencyCommissionSchema.index({ agencyId: 1, type: 1, status: 1 });

export default mongoose.model<IAgencyCommission>('AgencyCommission', AgencyCommissionSchema);
