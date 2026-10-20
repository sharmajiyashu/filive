import mongoose, { Schema, Document } from 'mongoose';

export type AppealStatus = 'pending' | 'under_review' | 'accepted' | 'rejected';
export type AppealOutcome =
  | 'none'
  | 'penalty_revoked'
  | 'penalty_reduced'
  | 'appeal_rejected';

export interface IAppeal extends Document {
  appealId: string;
  reportId?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  reason: string;
  explanation: string;
  evidenceUrls?: string[];
  status: AppealStatus;
  adminNotes?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  outcome: AppealOutcome;
  createdAt: Date;
  updatedAt: Date;
}

const AppealSchema: Schema = new Schema(
  {
    appealId: { type: String, unique: true, index: true },
    reportId: { type: Schema.Types.ObjectId, ref: 'Report', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: { type: String, required: true },
    explanation: { type: String, required: true },
    evidenceUrls: [{ type: String }],
    status: {
      type: String,
      enum: ['pending', 'under_review', 'accepted', 'rejected'],
      default: 'pending',
      index: true,
    },
    adminNotes: { type: String },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    outcome: {
      type: String,
      enum: ['none', 'penalty_revoked', 'penalty_reduced', 'appeal_rejected'],
      default: 'none',
    },
  },
  {
    timestamps: true,
  }
);

AppealSchema.index({ createdAt: -1 });
AppealSchema.index({ userId: 1, status: 1 });

export default mongoose.model<IAppeal>('Appeal', AppealSchema);
