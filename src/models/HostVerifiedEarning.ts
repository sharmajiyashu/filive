import mongoose, { Schema, Document } from 'mongoose';

export type EarningInvalidReason =
  | 'refunded_recharge'
  | 'chargeback'
  | 'suspicious_gift'
  | 'self_gifting'
  | 'cancelled_payment'
  | 'blocked_user'
  | 'agency_frozen'
  | 'commission_held';

export interface IHostVerifiedEarning extends Document {
  agencyId: mongoose.Types.ObjectId;
  hostUserId: mongoose.Types.ObjectId;
  senderUserId?: mongoose.Types.ObjectId;
  beansAmount: number;
  giftTransactionId?: string;
  rechargeTransactionId?: string;
  isValid: boolean;
  invalidReason?: EarningInvalidReason;
  cycleStart: Date;
  createdAt: Date;
  updatedAt: Date;
}

const HostVerifiedEarningSchema: Schema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    hostUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    beansAmount: { type: Number, required: true, min: 0 },
    giftTransactionId: { type: String },
    rechargeTransactionId: { type: String },
    isValid: { type: Boolean, default: true },
    invalidReason: {
      type: String,
      enum: [
        'refunded_recharge',
        'chargeback',
        'suspicious_gift',
        'self_gifting',
        'cancelled_payment',
        'blocked_user',
        'agency_frozen',
        'commission_held',
      ],
    },
    cycleStart: { type: Date, required: true },
  },
  { timestamps: true }
);

HostVerifiedEarningSchema.index({ agencyId: 1, cycleStart: 1, isValid: 1 });
HostVerifiedEarningSchema.index({ hostUserId: 1, createdAt: -1 });

export default mongoose.model<IHostVerifiedEarning>('HostVerifiedEarning', HostVerifiedEarningSchema);
