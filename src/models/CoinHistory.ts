import mongoose, { Schema, Document } from 'mongoose';

export type TransferTarget = 'self' | 'user' | 'coinseller';

export interface ICoinHistory extends Document {
  userId: mongoose.Types.ObjectId;
  relatedUserId?: mongoose.Types.ObjectId;
  amount: number; // Positive for credit, negative for debit
  type: 'recharge' | 'family_creation' | 'transfer' | 'charm_received' | 'beans_to_coins' | 'coins_to_beans' | 'agency_commission' | 'referral_reward' | 'gift_received' | 'gift_sent' | 'call_income' | 'cash_out' | 'exchange' | 'other';
  description?: string;
  transactionId?: string; // For payment gateways
  packageId?: mongoose.Types.ObjectId; // For tracking recharge coin package
  paymentGateway?: string; // e.g. 'PandaPay', 'Razorpay', 'CoinSeller', 'Admin'
  channelName?: string;
  giftId?: mongoose.Types.ObjectId;
  quantity?: number;
  transferTarget?: TransferTarget;
  createdAt: Date;
  updatedAt: Date;
}

const CoinHistorySchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    relatedUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    packageId: { type: Schema.Types.ObjectId, ref: 'CoinPackage' },
    amount: { type: Number, required: true },
    type: {
      type: String,
      enum: ['recharge', 'family_creation', 'transfer', 'charm_received', 'beans_to_coins', 'coins_to_beans', 'agency_commission', 'referral_reward', 'gift_received', 'gift_sent', 'call_income', 'cash_out', 'exchange', 'other'],
      required: true
    },
    description: { type: String },
    transactionId: { type: String },
    paymentGateway: { type: String },
    channelName: { type: String },
    giftId: { type: Schema.Types.ObjectId, ref: 'Gift' },
    quantity: { type: Number, min: 1 },
    transferTarget: { type: String, enum: ['self', 'user', 'coinseller'] },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ICoinHistory>('CoinHistory', CoinHistorySchema);
