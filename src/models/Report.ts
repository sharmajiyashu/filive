import mongoose, { Schema, Document } from 'mongoose';

export type ReportType = 'post' | 'profile' | 'live_room' | 'chat';
export type ReportStatus = 'pending' | 'under_review' | 'resolved' | 'rejected';
export type ReportPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ReportAction =
  | 'none'
  | 'warning'
  | 'content_removed'
  | 'mute'
  | 'ban_temporary'
  | 'ban_permanent'
  | 'room_closed'
  | 'rejected'
  | 'resolved';

export interface IActionHistory {
  adminId?: mongoose.Types.ObjectId;
  adminName?: string;
  action: string;
  reason?: string;
  notes?: string;
  timestamp: Date;
}

export interface IChatEvidenceMessage {
  messageId?: string;
  senderId?: string;
  senderName?: string;
  text?: string;
  type?: string;
  timestamp?: Date;
  mediaUrl?: string;
}

export interface IReportEvidence {
  targetId?: string;
  postId?: mongoose.Types.ObjectId;
  postMediaUrl?: string;
  postCaption?: string;
  roomId?: mongoose.Types.ObjectId;
  roomTitle?: string;
  liveHostId?: mongoose.Types.ObjectId;
  messageId?: mongoose.Types.ObjectId;
  chatTranscript?: IChatEvidenceMessage[];
  mediaUrls?: string[];
  mediaIds?: mongoose.Types.ObjectId[];
  customContext?: string;
}

export interface IReport extends Document {
  reportId: string;
  reportType: ReportType;
  reporterId: mongoose.Types.ObjectId;
  reportedUserId?: mongoose.Types.ObjectId;
  reason: string;
  description?: string;
  evidence?: IReportEvidence;
  status: ReportStatus;
  priority: ReportPriority;
  complaintGroupKey?: string;
  adminNotes?: string;
  assignedAdminId?: mongoose.Types.ObjectId;
  actionTaken: ReportAction;
  actionDetails?: string;
  actionHistory: IActionHistory[];
  appealId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ActionHistorySchema = new Schema(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'User' },
    adminName: { type: String },
    action: { type: String, required: true },
    reason: { type: String },
    notes: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ChatEvidenceSchema = new Schema(
  {
    messageId: { type: String },
    senderId: { type: String },
    senderName: { type: String },
    text: { type: String },
    type: { type: String },
    timestamp: { type: Date },
    mediaUrl: { type: String },
  },
  { _id: false }
);

const EvidenceSchema = new Schema(
  {
    targetId: { type: String },
    postId: { type: Schema.Types.ObjectId, ref: 'Story' },
    postMediaUrl: { type: String },
    postCaption: { type: String },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room' },
    roomTitle: { type: String },
    liveHostId: { type: Schema.Types.ObjectId, ref: 'User' },
    messageId: { type: Schema.Types.ObjectId, ref: 'Message' },
    chatTranscript: [ChatEvidenceSchema],
    mediaUrls: [{ type: String }],
    mediaIds: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    customContext: { type: String },
  },
  { _id: false }
);

const ReportSchema: Schema = new Schema(
  {
    reportId: { type: String, unique: true, index: true },
    reportType: {
      type: String,
      enum: ['post', 'profile', 'live_room', 'chat'],
      required: true,
      index: true,
    },
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportedUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    reason: { type: String, required: true, index: true },
    description: { type: String },
    evidence: { type: EvidenceSchema, default: () => ({}) },
    status: {
      type: String,
      enum: ['pending', 'under_review', 'resolved', 'rejected'],
      default: 'pending',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
      index: true,
    },
    complaintGroupKey: { type: String, index: true },
    adminNotes: { type: String },
    assignedAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
    actionTaken: {
      type: String,
      enum: [
        'none',
        'warning',
        'content_removed',
        'mute',
        'ban_temporary',
        'ban_permanent',
        'room_closed',
        'rejected',
        'resolved',
      ],
      default: 'none',
    },
    actionDetails: { type: String },
    actionHistory: [ActionHistorySchema],
    appealId: { type: Schema.Types.ObjectId, ref: 'Appeal' },
  },
  {
    timestamps: true,
  }
);

ReportSchema.index({ createdAt: -1 });
ReportSchema.index({ status: 1, reportType: 1 });
ReportSchema.index({ complaintGroupKey: 1, createdAt: -1 });

export default mongoose.model<IReport>('Report', ReportSchema);
