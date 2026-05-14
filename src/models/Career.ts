import mongoose, { Schema, Document } from 'mongoose';

export interface ICareer extends Document {
  name: string;
  image?: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CareerSchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    image: { type: Schema.Types.ObjectId, ref: 'Media' },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ICareer>('Career', CareerSchema);
