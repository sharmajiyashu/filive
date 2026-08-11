import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  userId?: number;
  beans?: number;
  name?: string;
  email: string;
  password?: string;
  mobile?: string;
  whatsapp?: string;
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
  audioCallChargePerMinute: number;
  videoCallChargePerMinute: number;
  hostVerificationCode?: string;
  activeEntity?: mongoose.Types.ObjectId;
  activeFrame?: mongoose.Types.ObjectId;
  activeChatBubble?: mongoose.Types.ObjectId;
  activeTheme?: mongoose.Types.ObjectId;
  activeRide?: mongoose.Types.ObjectId;
  isCoinseller: boolean;
  coinSellerCoins: number;
  videoVerificationVideo?: mongoose.Types.ObjectId;
  videoVerificationStatus: 'none' | 'pending' | 'approved' | 'rejected';
  referredBy?: mongoose.Types.ObjectId;
  referralCode?: string;
  referCode?: string;
  instantBlock: boolean;
  deviceBan: boolean;
  blockReason?: string;
  blockedUntil?: Date;
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
    whatsapp: { type: String },
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
    audioCallChargePerMinute: { type: Number, default: 0 },
    videoCallChargePerMinute: { type: Number, default: 0 },
    hostVerificationCode: { type: String, unique: true, sparse: true },
    activeEntity: { type: Schema.Types.ObjectId, ref: 'StoreItem' },
    activeFrame: { type: Schema.Types.ObjectId, ref: 'StoreItem' },
    activeChatBubble: { type: Schema.Types.ObjectId, ref: 'StoreItem' },
    activeTheme: { type: Schema.Types.ObjectId, ref: 'StoreItem' },
    activeRide: { type: Schema.Types.ObjectId, ref: 'StoreItem' },
    isCoinseller: { type: Boolean, default: false },
    coinSellerCoins: { type: Number, default: 0 },
    videoVerificationVideo: { type: Schema.Types.ObjectId, ref: 'Media' },
    videoVerificationStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    referredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    referralCode: { type: String, unique: true, sparse: true },
    referCode: { type: String, sparse: true },
    instantBlock: { type: Boolean, default: false },
    deviceBan: { type: Boolean, default: false },
    blockReason: { type: String },
    blockedUntil: { type: Date },
  },
  {
    timestamps: true,
  }
);

UserSchema.pre('save', async function (next) {
  const user = this as any;
  if (!user.userId) {
    // 8-digit fixed public User ID starting at 10000001
    const highestUser: any = await mongoose.models.User.findOne({ userId: { $gte: 10000001, $lte: 99999999 } })
      .sort({ userId: -1 })
      .lean();

    let nextUserId = 10000001;
    if (highestUser && highestUser.userId && highestUser.userId >= 10000001) {
      nextUserId = Number(highestUser.userId) + 1;
    }

    // Ensure uniqueness even if accounts were deleted or gaps exist
    let unique = false;
    let attempts = 0;
    while (!unique && attempts < 100) {
      const exists = await mongoose.models.User.findOne({ userId: nextUserId });
      if (!exists) {
        user.userId = nextUserId;
        unique = true;
      } else {
        nextUserId++;
      }
      attempts++;
    }

    if (!unique) {
      // Fallback 8-digit random generator (10000000 to 99999999)
      user.userId = Math.floor(10000000 + Math.random() * 90000000);
    }
  }

  if (!user.hostVerificationCode) {
    user.hostVerificationCode = Math.random().toString(36).substring(2, 8).toUpperCase();
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
