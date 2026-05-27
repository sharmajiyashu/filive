import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  userId?: number;
  beans?: number;
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
  selfIntroduce?: string;
  height?: string;
  country?: string;
  maritalStatus?: string;
  notificationPreferences: {
    inApp: boolean;
    newMessage: boolean;
    vibrations: boolean;
  };
  privacySettings: {
    hideWealthLevel: boolean;
    hideCharmLevel: boolean;
    anonymousRanking: boolean;
  };
  weight?: string;
  careerId?: mongoose.Types.ObjectId;
  career?: any;
  emotionalStatus?: 'single' | 'divorced' | 'married' | 'secret' | 'inlove';
  nationality?: string;
  hobbies?: (mongoose.Types.ObjectId | any)[];
  album?: mongoose.Types.ObjectId[];
  coins: number;
  wealthCoins: number;
  charmCoins: number;
  countryId?: mongoose.Types.ObjectId;
  enableVoiceCall: boolean;
  enableVideoCall: boolean;
  voiceCallPrice: number;
  videoCallPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    userId: { type: Number, unique: true, sparse: true },
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
    selfIntroduce: { type: String },
    height: { type: String },
    weight: { type: String },
    careerId: { type: Schema.Types.ObjectId, ref: 'Career' },
    emotionalStatus: { type: String, enum: ['single', 'divorced', 'married', 'secret', 'inlove'] },
    nationality: { type: String },
    hobbies: [{ type: Schema.Types.ObjectId, ref: 'Hobby' }],
    album: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    country: { type: String },
    maritalStatus: { type: String },
    notificationPreferences: {
      inApp: { type: Boolean, default: true },
      newMessage: { type: Boolean, default: true },
      vibrations: { type: Boolean, default: true },
    },
    privacySettings: {
      hideWealthLevel: { type: Boolean, default: false },
      hideCharmLevel: { type: Boolean, default: false },
      anonymousRanking: { type: Boolean, default: false },
    },
    coins: { type: Number, default: 0 },
    beans: { type: Number, default: 0 },
    wealthCoins: { type: Number, default: 0 },
    charmCoins: { type: Number, default: 0 },
    countryId: { type: Schema.Types.ObjectId, ref: 'Country' },
    enableVoiceCall: { type: Boolean, default: false },
    enableVideoCall: { type: Boolean, default: false },
    voiceCallPrice: { type: Number, default: 0 },
    videoCallPrice: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

UserSchema.pre('save', async function (next) {
  const user = this as any;
  if (!user.userId) {
    let unique = false;
    let attempts = 0;
    while (!unique && attempts < 100) {
      const randomId = Math.floor(1000000000 + Math.random() * 9000000000);
      const exists = await mongoose.models.User.findOne({ userId: randomId });
      if (!exists) {
        user.userId = randomId;
        unique = true;
      }
      attempts++;
    }
  }
  next();
});

setTimeout(async () => {
  try {
    const Model = mongoose.model('User');
    const usersWithoutId = await Model.find({ userId: { $exists: false } });
    for (const user of usersWithoutId) {
      await user.save();
    }
  } catch (error) {
    console.error('Error migrating existing users to generate userId:', error);
  }
}, 5000);

export default mongoose.model<IUser>('User', UserSchema);
