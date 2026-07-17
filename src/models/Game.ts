import mongoose, { Schema, Document } from 'mongoose';

export interface IGame extends Document {
  name: string;
  link: string;
  minWinPercent: number;
  maxWinPercent: number;
  image?: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GameSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    link: { type: String, required: true, trim: true },
    minWinPercent: { type: Number, required: true, min: 0, max: 100 },
    maxWinPercent: { type: Number, required: true, min: 0, max: 100 },
    image: { type: Schema.Types.ObjectId, ref: 'Media' },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

GameSchema.index({ isActive: 1 });

export default mongoose.model<IGame>('Game', GameSchema);
