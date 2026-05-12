import mongoose, { Schema, Document } from 'mongoose';

export interface ICountry extends Document {
  name: string;
  code: string; // ISO 3166-1 alpha-2
  flag: string; // URL to flag image
  currencySymbol: string;
  currencyCode: string;
  exchangeRate: number; // Value of 1 USD in this currency
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CountrySchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true },
    flag: { type: String, required: true },
    currencySymbol: { type: String, required: true },
    currencyCode: { type: String, required: true },
    exchangeRate: { type: Number, required: true, default: 1 },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<ICountry>('Country', CountrySchema);
