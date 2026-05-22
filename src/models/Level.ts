import mongoose, { Schema, Document } from 'mongoose';

export interface ILevel extends Document {
  levelNumber: number;
  name: string;
  minCoins: number;
  maxCoins: number;
  color: string;
  image?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LevelSchema: Schema = new Schema(
  {
    levelNumber: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    minCoins: { type: Number, required: true },
    maxCoins: { type: Number, required: true },
    color: { type: String, required: true },
    image: { type: String },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ILevel>('Level', LevelSchema);
