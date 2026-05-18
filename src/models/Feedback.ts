import mongoose, { Schema, Document } from 'mongoose';

export interface IFeedback extends Document {
  email: string;
  feedbackType: string;
  description: string;
  images: mongoose.Types.ObjectId[];
  status: 'pending' | 'completed';
  userId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FeedbackSchema: Schema = new Schema(
  {
    email: { type: String, required: true },
    feedbackType: { type: String, required: true },
    description: { type: String, required: true },
    images: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IFeedback>('Feedback', FeedbackSchema);
