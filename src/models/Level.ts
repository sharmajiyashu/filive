import mongoose, { Schema, Document } from 'mongoose';

export interface ILevel extends Document {
  levelNumber: number;
  type: 'rich' | 'charm';
  name: string;
  minCoins: number;
  maxCoins: number;
  color: string;
  image?: mongoose.Types.ObjectId | any;
  media?: any;
  rangeText?: string;
  levelRange?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LevelSchema: Schema = new Schema(
  {
    levelNumber: { type: Number, required: true },
    type: { type: String, enum: ['rich', 'charm'], required: true },
    name: { type: String, required: true },
    minCoins: { type: Number, required: true },
    maxCoins: { type: Number, required: true },
    color: { type: String, required: true },
    image: { type: Schema.Types.ObjectId, ref: 'Media' },
    rangeText: { type: String },
    levelRange: { type: String },
  },
  {
    timestamps: true,
  }
);

LevelSchema.index({ levelNumber: 1, type: 1 }, { unique: true });

export default mongoose.model<ILevel>('Level', LevelSchema);
