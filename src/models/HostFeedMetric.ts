import mongoose, { Schema, Document } from 'mongoose';

export interface IHostFeedMetric extends Document {
  hostId: mongoose.Types.ObjectId;
  callRankingScore: number; // 0 to 100 composite score
  callPerformanceScore: number; // 25% weight
  answerRateScore: number; // 20% weight
  engagementScore: number; // 15% weight
  availabilityScore: number; // 15% weight
  durationScore: number; // 10% weight
  uniqueCallersScore: number; // 10% weight
  complianceScore: number; // 5% weight

  // 7-day signals
  callAttempts7d: number;
  acceptedCalls7d: number;
  completedCalls7d: number;
  missedCalls7d: number;
  totalDurationSeconds7d: number;
  uniqueCallers7d: number;
  profileViews7d: number;
  impressions7d: number;

  // 28-day stability signals
  callAttempts28d: number;
  completedCalls28d: number;
  reports28d: number;

  // New Host Promotion (Days 1–7)
  newHostEligibleAt?: Date;
  newHostBoost: number; // 0 - 100 decayed boost score

  lastCalculatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const HostFeedMetricSchema: Schema = new Schema(
  {
    hostId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    callRankingScore: { type: Number, default: 50, index: true },
    callPerformanceScore: { type: Number, default: 50 },
    answerRateScore: { type: Number, default: 50 },
    engagementScore: { type: Number, default: 50 },
    availabilityScore: { type: Number, default: 50 },
    durationScore: { type: Number, default: 50 },
    uniqueCallersScore: { type: Number, default: 50 },
    complianceScore: { type: Number, default: 100 },

    callAttempts7d: { type: Number, default: 0 },
    acceptedCalls7d: { type: Number, default: 0 },
    completedCalls7d: { type: Number, default: 0 },
    missedCalls7d: { type: Number, default: 0 },
    totalDurationSeconds7d: { type: Number, default: 0 },
    uniqueCallers7d: { type: Number, default: 0 },
    profileViews7d: { type: Number, default: 0 },
    impressions7d: { type: Number, default: 0 },

    callAttempts28d: { type: Number, default: 0 },
    completedCalls28d: { type: Number, default: 0 },
    reports28d: { type: Number, default: 0 },

    newHostEligibleAt: { type: Date, index: true },
    newHostBoost: { type: Number, default: 0 },

    lastCalculatedAt: { type: Date, default: () => new Date() },
  },
  {
    timestamps: true,
  }
);

HostFeedMetricSchema.index({ callRankingScore: -1, lastCalculatedAt: -1 });
HostFeedMetricSchema.index({ newHostEligibleAt: -1, newHostBoost: -1 });

export default mongoose.model<IHostFeedMetric>('HostFeedMetric', HostFeedMetricSchema);
