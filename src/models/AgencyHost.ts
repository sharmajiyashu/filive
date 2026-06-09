import mongoose, { Schema, Document } from 'mongoose';

export interface IAgencyHost extends Document {
  agencyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  requestedBy: 'USER' | 'AGENCY';
  messageId?: mongoose.Types.ObjectId;
  isOpened: boolean;
  isVerified: boolean;
  openedAt?: Date;
  verifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AgencyHostSchema: Schema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED'], default: 'PENDING' },
    requestedBy: { type: String, enum: ['USER', 'AGENCY'], required: true },
    messageId: { type: Schema.Types.ObjectId, ref: 'Message' },
    isOpened: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    openedAt: { type: Date },
    verifiedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IAgencyHost>('AgencyHost', AgencyHostSchema);
