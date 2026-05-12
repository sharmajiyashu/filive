import mongoose, { Schema, Document } from 'mongoose';

export interface IFamilyMember extends Document {
  familyId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: 'creator' | 'admin' | 'member';
  joinedAt: Date;
}

const FamilyMemberSchema: Schema = new Schema(
  {
    familyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['creator', 'admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Ensure a user can only be in one family at a time (optional, based on common patterns)
// FamilyMemberSchema.index({ userId: 1 }, { unique: true });

export default mongoose.model<IFamilyMember>('FamilyMember', FamilyMemberSchema);
