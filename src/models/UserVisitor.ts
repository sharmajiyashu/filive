import mongoose, { Schema, Document } from 'mongoose';

export interface IUserVisitor extends Document {
  userId: mongoose.Types.ObjectId;
  visitorId: mongoose.Types.ObjectId;
  visitedAt: Date;
}

const UserVisitorSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    visitorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    visitedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Optional: Ensure unique visit per day or similar if needed, 
// but for now we'll just store every visit and count unique visitorIds.
UserVisitorSchema.index({ userId: 1, visitorId: 1 });

export default mongoose.model<IUserVisitor>('UserVisitor', UserVisitorSchema);
