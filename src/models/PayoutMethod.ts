import mongoose, { Schema, Document } from 'mongoose';

export interface IPayoutField {
  fieldName: string;
  fieldLabel: string;
  fieldType: 'text' | 'number' | 'select';
  placeholder?: string;
  required: boolean;
  options?: string[];
}

export interface IPayoutMethod extends Document {
  name: string;
  media?: mongoose.Types.ObjectId;
  countries: string[]; // ISO country codes or country names (e.g., ['IN', 'US', 'KH'])
  fields: IPayoutField[];
  minAmount?: number;
  maxAmount?: number;
  instructions?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PayoutFieldSchema: Schema = new Schema(
  {
    fieldName: { type: String, required: true },
    fieldLabel: { type: String, required: true },
    fieldType: { type: String, enum: ['text', 'number', 'select'], default: 'text' },
    placeholder: { type: String, default: '' },
    required: { type: Boolean, default: true },
    options: [{ type: String }],
  },
  { _id: false }
);

const PayoutMethodSchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    media: { type: Schema.Types.ObjectId, ref: 'Media' },
    countries: [{ type: String, required: true }],
    fields: [PayoutFieldSchema],
    minAmount: { type: Number, default: 0 },
    maxAmount: { type: Number, default: 100000 },
    instructions: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IPayoutMethod>('PayoutMethod', PayoutMethodSchema);
