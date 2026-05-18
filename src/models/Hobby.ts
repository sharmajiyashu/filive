import mongoose, { Schema, Document } from 'mongoose';

export interface IHobby extends Document {
  name: string;
  type: 'sports' | 'food' | 'music';
  image?: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const HobbySchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ['sports', 'food', 'music'], required: true },
    image: { type: Schema.Types.ObjectId, ref: 'Media' },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

// Compound index to guarantee uniqueness of hobbies per type/category
HobbySchema.index({ name: 1, type: 1 }, { unique: true });

export default mongoose.model<IHobby>('Hobby', HobbySchema);
