import mongoose, { Schema, Document } from 'mongoose';

export interface ILanguage extends Document {
  name: string; // English name
  nativeName: string; // Native script name
  code: string; // ISO 639-1 code
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LanguageSchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    nativeName: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ILanguage>('Language', LanguageSchema);
