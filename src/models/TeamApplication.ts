import mongoose, { Schema, Document } from 'mongoose';

export type TeamInquiryType = 'host' | 'agency' | 'partner';
export type TeamApplicationStatus = 'pending' | 'contacted' | 'approved' | 'rejected';

export interface ITeamApplication extends Document {
  name: string;
  email: string;
  inquiryType: TeamInquiryType;
  audienceSize?: string;
  message: string;
  status: TeamApplicationStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TeamApplicationSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    inquiryType: {
      type: String,
      enum: ['host', 'agency', 'partner'],
      default: 'host',
    },
    audienceSize: { type: String, trim: true, default: '' },
    message: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'contacted', 'approved', 'rejected'],
      default: 'pending',
    },
    notes: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

TeamApplicationSchema.index({ status: 1, createdAt: -1 });
TeamApplicationSchema.index({ email: 1 });

export default mongoose.model<ITeamApplication>('TeamApplication', TeamApplicationSchema);
