import mongoose, { Schema, Document } from 'mongoose';

export interface IReaction extends Document {
  name: string;
  code: string;
  emoji?: string;
  gifUrl?: string;
  mediaId?: mongoose.Types.ObjectId;
  category: 'emoji' | 'animated_gif' | 'custom';
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReactionSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    emoji: { type: String },
    gifUrl: { type: String },
    mediaId: { type: Schema.Types.ObjectId, ref: 'Media' },
    category: { type: String, enum: ['emoji', 'animated_gif', 'custom'], default: 'animated_gif' },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IReaction>('Reaction', ReactionSchema);
