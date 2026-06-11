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
  totalEarnings: number;
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
    totalEarnings: { type: Number, default: 0 },
    otp: { type: String },
    otpExpires: { type: Date },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IAgency>('Agency', AgencySchema);
