import mongoose, { Schema, Document } from 'mongoose';

export interface ILiveDataLog extends Document {
  userId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM

  // Call Data (1v1 Calls)
  totalBeansIncome: number;
  totalCallIncome: number;
  totalCalls: number;
  voiceIncome: number;
  totalDurationSeconds: number;
  giftSendersCount: number;
  avgRating: number;
  uniqueCallersCount: number;
  repeatUsersCount: number;
  reportsCount: number;

  // Live Stream Data
  liveBeansIncome: number;
  liveEHours: number;
  liveViewers: number;
  liveDurationSeconds: number;
  liveGiftSendersCount: number;

  // Party Room Data
  partyBeansIncome: number;
  roomOwnerSeconds: number;
  partyEHours: number;
  totalMicSeconds: number;
  partyEDay: number;
  userOnMicCount: number;
  audienceCount: number;
  partyGiftSendersCount: number;
  micUserIds?: mongoose.Types.ObjectId[];
  audienceUserIds?: mongoose.Types.ObjectId[];

  // Fans & Tasks
  newFansCount: number;
  hostTask: {
    title: string;
    completedMinutes: number;
    targetMinutes: number;
    rewardBeans: number;
    isCompleted: boolean;
  };

  createdAt: Date;
  updatedAt: Date;
}

const LiveDataLogSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    month: { type: String, required: true },

    // Call Data
    totalBeansIncome: { type: Number, default: 0 },
    totalCallIncome: { type: Number, default: 0 },
    totalCalls: { type: Number, default: 0 },
    voiceIncome: { type: Number, default: 0 },
    totalDurationSeconds: { type: Number, default: 0 },
    giftSendersCount: { type: Number, default: 0 },
    avgRating: { type: Number, default: 5.0 },
    uniqueCallersCount: { type: Number, default: 0 },
    repeatUsersCount: { type: Number, default: 0 },
    reportsCount: { type: Number, default: 0 },

    // Live Stream Data
    liveBeansIncome: { type: Number, default: 0 },
    liveEHours: { type: Number, default: 0 },
    liveViewers: { type: Number, default: 0 },
    liveDurationSeconds: { type: Number, default: 0 },
    liveGiftSendersCount: { type: Number, default: 0 },

    // Party Room Data
    partyBeansIncome: { type: Number, default: 0 },
    roomOwnerSeconds: { type: Number, default: 0 },
    partyEHours: { type: Number, default: 0 },
    totalMicSeconds: { type: Number, default: 0 },
    partyEDay: { type: Number, default: 0 },
    userOnMicCount: { type: Number, default: 0 },
    audienceCount: { type: Number, default: 0 },
    partyGiftSendersCount: { type: Number, default: 0 },
    micUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    audienceUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    // Fans & Tasks
    newFansCount: { type: Number, default: 0 },
    hostTask: {
      title: { type: String, default: 'Complete 120 min of 1v1 calls today to earn 10000 extra beans!' },
      completedMinutes: { type: Number, default: 0 },
      targetMinutes: { type: Number, default: 120 },
      rewardBeans: { type: Number, default: 10000 },
      isCompleted: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

LiveDataLogSchema.index({ userId: 1, date: 1 }, { unique: true });
LiveDataLogSchema.index({ userId: 1, month: 1 });

export default mongoose.model<ILiveDataLog>('LiveDataLog', LiveDataLogSchema);
