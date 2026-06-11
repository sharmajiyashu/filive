import mongoose, { Schema, Document } from 'mongoose';

export interface IAgencyCommission extends Document {
  agencyId: mongoose.Types.ObjectId;
  hostUserId?: mongoose.Types.ObjectId;
  amount: number;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AgencyCommissionSchema: Schema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    hostUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    amount: { type: Number, required: true },
    description: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<IAgencyCommission>('AgencyCommission', AgencyCommissionSchema);
