import mongoose, { Schema, Document } from 'mongoose';

export interface IFamily extends Document {
  name: string;
  creatorId: mongoose.Types.ObjectId;
  announcement?: string;
  image?: mongoose.Types.ObjectId;
  memberCount: number;
  tags: string[]; // For tagged people or categories
  createdAt: Date;
  updatedAt: Date;
}

const FamilySchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    creatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    announcement: { type: String },
    image: { type: Schema.Types.ObjectId, ref: 'Media' },
    memberCount: { type: Number, default: 1 }, // Creator is the first member
    tags: [{ type: String }],
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IFamily>('Family', FamilySchema);
