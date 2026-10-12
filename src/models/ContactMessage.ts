import mongoose, { Schema, Document } from 'mongoose';

export type ContactMessageStatus = 'pending' | 'contacted' | 'resolved' | 'spam';

export interface IContactMessage extends Document {
  name: string;
  email: string;
  subject?: string;
  message: string;
  status: ContactMessageStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ContactMessageSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    subject: { type: String, trim: true, default: '' },
    message: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'contacted', 'resolved', 'spam'],
      default: 'pending',
    },
    notes: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

ContactMessageSchema.index({ status: 1, createdAt: -1 });
ContactMessageSchema.index({ email: 1 });

export default mongoose.model<IContactMessage>('ContactMessage', ContactMessageSchema);
