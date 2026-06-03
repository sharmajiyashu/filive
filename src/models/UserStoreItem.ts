import mongoose, { Schema, Document } from 'mongoose';

export interface IUserStoreItem extends Document {
  userId: mongoose.Types.ObjectId;
  storeItemId: mongoose.Types.ObjectId;
  purchasedAt: Date;
  expiresAt: Date;
  inUse: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserStoreItemSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    storeItemId: { type: Schema.Types.ObjectId, ref: 'StoreItem', required: true },
    purchasedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    inUse: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IUserStoreItem>('UserStoreItem', UserStoreItemSchema);
