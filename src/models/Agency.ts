import mongoose, { Schema, Document } from 'mongoose';

export interface IAgency extends Document {
  name: string;
  countryId: mongoose.Types.ObjectId;
  mobile: string;
  email: string;
  description: string;
  creatorId: mongoose.Types.ObjectId;
  isVerified: boolean;
  status: 'pending' | 'approved' | 'rejected';
  commissionRate: number;
  useAgencyCommissionRate: boolean;
  totalEarnings: number;
  pendingCommission: number;
  thisWeekHostEarnings: number;
  thisWeekCommission: number;
  currentCycleStart: Date;
  lastSettlementDate?: Date;
  nextSettlementDate?: Date;
  isFrozen: boolean;
  isCommissionHeld: boolean;
  otp?: string;
  otpExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AgencySchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    countryId: { type: Schema.Types.ObjectId, ref: 'Country', required: true },
    mobile: { type: String, required: true },
    email: { type: String },
    description: { type: String },
    creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isVerified: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    commissionRate: { type: Number, default: 10 },
    useAgencyCommissionRate: { type: Boolean, default: false },
    totalEarnings: { type: Number, default: 0 },
    pendingCommission: { type: Number, default: 0 },
    thisWeekHostEarnings: { type: Number, default: 0 },
    thisWeekCommission: { type: Number, default: 0 },
    currentCycleStart: { type: Date, default: () => new Date() },
    lastSettlementDate: { type: Date },
    nextSettlementDate: { type: Date },
    isFrozen: { type: Boolean, default: false },
    isCommissionHeld: { type: Boolean, default: false },
    otp: { type: String },
    otpExpires: { type: Date },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IAgency>('Agency', AgencySchema);
