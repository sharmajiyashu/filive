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
  },
  {
    timestamps: true,
  }
);

UserStoreItemSchema.index({ inUse: 1, expiresAt: 1 });
UserStoreItemSchema.index({ userId: 1, expiresAt: 1 });
UserStoreItemSchema.index({ userId: 1, inUse: 1, expiresAt: 1 });
UserStoreItemSchema.index({ userId: 1, storeItemId: 1, expiresAt: 1 });

export default mongoose.model<IUserStoreItem>('UserStoreItem', UserStoreItemSchema);
