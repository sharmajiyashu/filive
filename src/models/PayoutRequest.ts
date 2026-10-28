import mongoose, { Schema, Document } from 'mongoose';

export interface IPayoutFieldValue {
  fieldName: string;
  fieldLabel: string;
  value: string;
}

export interface IPayoutRequest extends Document {
  user: mongoose.Types.ObjectId;
  payoutMethod: mongoose.Types.ObjectId;
  payoutMethodSnapshot?: {
    name: string;
    mediaUrl?: string;
    countryCode?: string;
  };
  fieldValues: IPayoutFieldValue[];
  amount: number; // Net amount payable
  grossAmount?: number; // Gross amount before fees
  feeAmount?: number; // Service fee amount deducted
  feePercent?: number; // Fee percentage applied
  currency: string;
  usdAmount?: number; // Net amount in USD
  usdGrossAmount?: number; // Gross amount in USD
  exchangeRate?: number;
  coins?: number;
  status: 'pending' | 'approved' | 'rejected' | 'processing';
  adminNote?: string;
  transactionId?: string;
  processedAt?: Date;
  processedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PayoutFieldValueSchema: Schema = new Schema(
  {
    fieldName: { type: String, required: true },
    fieldLabel: { type: String, required: true },
    value: { type: String, required: true },
  },
  { _id: false }
);

const PayoutRequestSchema: Schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    payoutMethod: { type: Schema.Types.ObjectId, ref: 'PayoutMethod', required: true },
    payoutMethodSnapshot: {
      name: { type: String },
      mediaUrl: { type: String },
      countryCode: { type: String },
    },
    fieldValues: [PayoutFieldValueSchema],
    amount: { type: Number, required: true },
    grossAmount: { type: Number, default: 0 },
    feeAmount: { type: Number, default: 0 },
    feePercent: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    usdAmount: { type: Number, default: 0 },
    usdGrossAmount: { type: Number, default: 0 },
    exchangeRate: { type: Number, default: 1 },
    coins: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'processing'],
      default: 'pending',
    },
    adminNote: { type: String, default: '' },
    transactionId: { type: String, default: '' },
    processedAt: { type: Date },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IPayoutRequest>('PayoutRequest', PayoutRequestSchema);
