import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  name?: string;
  email: string;
  password?: string;
  mobile?: string;
  userRole: 'user' | 'admin';
  bio?: string;
  otp?: string;
  otpExpires?: Date;
  adminRoleId?: mongoose.Types.ObjectId;
  profileImage?: mongoose.Types.ObjectId;
  isBlocked: boolean;
  location?: {
    lat?: number;
    lng?: number;
    address?: string;
    city?: string;
    state?: string;
    zipcode?: string;
  };
  lastLoginAt?: Date;
  fcmTokens?: { token: string; deviceType?: string; updatedAt?: Date }[];
  isVerified: boolean;
  isPremium: boolean;
  gender?: 'Male' | 'Female' | 'Other';
  dob?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    name: { type: String },
    email: { type: String, unique: true, sparse: true },
    password: { type: String },
    mobile: { type: String, unique: true, sparse: true },
    userRole: { type: String, enum: ['user', 'admin'], default: 'user' },
    bio: { type: String },
    otp: { type: String },
    otpExpires: { type: Date },
    adminRoleId: { type: Schema.Types.ObjectId, ref: 'AdminRole' },
    profileImage: { type: Schema.Types.ObjectId, ref: 'Media' },
    isBlocked: { type: Boolean, default: false },
    location: {
      lat: { type: Number },
      lng: { type: Number },
      address: { type: String },
      city: { type: String },
      state: { type: String },
      zipcode: { type: String },
    },
    lastLoginAt: { type: Date },
    fcmTokens: [
      {
        token: { type: String, required: true },
        deviceType: { type: String, enum: ['android', 'ios', 'web'] },
        updatedAt: { type: Date, default: () => new Date() },
      },
    ],
    isVerified: { type: Boolean, default: false },
    isPremium: { type: Boolean, default: false },
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    dob: { type: Date },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IUser>('User', UserSchema);
