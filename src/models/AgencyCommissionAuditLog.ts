import mongoose, { Schema, Document } from 'mongoose';

export interface IAgencyCommissionAuditLog extends Document {
  action:
    | 'slab_created'
    | 'slab_updated'
    | 'slab_deleted'
    | 'settings_updated'
    | 'batch_generated'
    | 'batch_approved'
    | 'batch_settled'
    | 'manual_adjustment'
    | 'retry_settlement'
    | 'agency_mapping';
  adminId?: mongoose.Types.ObjectId;
  adminName?: string;
  targetId?: string;
  oldValue?: any;
  newValue?: any;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AgencyCommissionAuditLogSchema: Schema = new Schema(
  {
    action: {
      type: String,
      enum: [
        'slab_created',
        'slab_updated',
        'slab_deleted',
        'settings_updated',
        'batch_generated',
        'batch_approved',
        'batch_settled',
        'manual_adjustment',
        'retry_settlement',
        'agency_mapping',
      ],
      required: true,
      index: true,
    },
    adminId: { type: Schema.Types.ObjectId, ref: 'AdminUser' },
    adminName: { type: String },
    targetId: { type: String, index: true },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    reason: { type: String },
  },
  { timestamps: true }
);

AgencyCommissionAuditLogSchema.index({ createdAt: -1 });

export default mongoose.model<IAgencyCommissionAuditLog>(
  'AgencyCommissionAuditLog',
  AgencyCommissionAuditLogSchema
);

