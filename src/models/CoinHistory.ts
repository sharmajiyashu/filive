import mongoose, { Schema, Document } from 'mongoose';

export interface ICoinHistory extends Document {
  userId: mongoose.Types.ObjectId;
  relatedUserId?: mongoose.Types.ObjectId;
  amount: number; // Positive for credit, negative for debit
  type: 'recharge' | 'family_creation' | 'transfer' | 'charm_received' | 'beans_to_coins' | 'coins_to_beans' | 'other';
  description?: string;
  transactionId?: string; // For payment gateways
  createdAt: Date;
  updatedAt: Date;
}

const CoinHistorySchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    relatedUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    amount: { type: Number, required: true },
    type: {
      type: String,
      enum: ['recharge', 'family_creation', 'transfer', 'charm_received', 'beans_to_coins', 'coins_to_beans', 'other'],
      required: true
    },
    description: { type: String },
    transactionId: { type: String },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ICoinHistory>('CoinHistory', CoinHistorySchema);
