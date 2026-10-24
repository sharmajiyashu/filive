import { Service } from 'typedi';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../../models/User';
import AppLogger from '../../api/loaders/logger';

export interface ISecurityStatus {
  userId?: number;
  mobile?: string;
  isMobileBound: boolean;
  email?: string;
  isEmailBound: boolean;
  googleId?: string;
  isGoogleBound: boolean;
  facebookId?: string;
  isFacebookBound: boolean;
  appleId?: string;
  isAppleBound: boolean;
  hasPassword: boolean;
  authProvider: string;
  deviceId?: string;
  deviceModel?: string;
}

@Service()
export class AccountSecurityService {
  /**
   * Fetch current user's security bindings and status
   */
  public async getSecurityStatus(userId: string): Promise<ISecurityStatus> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const hasMobile = Boolean(user.mobile && user.mobile.trim().length > 0);
    const hasEmail = Boolean(user.email && user.email.trim().length > 0);
    const hasGoogle = Boolean(user.googleId && user.googleId.trim().length > 0);
    const hasFacebook = Boolean(user.facebookId && user.facebookId.trim().length > 0);
    const hasApple = Boolean(user.appleId && user.appleId.trim().length > 0);
    const hasPassword = Boolean(user.password && user.password.length > 0);

    return {
      userId: user.userId,
      mobile: user.mobile || '',
      isMobileBound: hasMobile,
      email: user.email || '',
      isEmailBound: hasEmail,
      googleId: user.googleId || '',
      isGoogleBound: hasGoogle,
      facebookId: user.facebookId || '',
      isFacebookBound: hasFacebook,
      appleId: user.appleId || '',
      isAppleBound: hasApple,
      hasPassword,
      authProvider: user.authProvider || 'phone',
      deviceId: user.deviceId || '',
      deviceModel: user.deviceModel || 'Mobile Device',
    };
  }

  /**
   * Send OTP for binding a new mobile phone number
   */
  public async sendBindMobileOtp(userId: string, mobile: string, extension: string = '+91') {
    const cleanExtension = extension.startsWith('+') ? extension : `+${extension}`;
    const cleanMobile = mobile.replace(/[^0-9]/g, '');
    const fullMobile = `${cleanExtension}${cleanMobile}`;

    if (!cleanMobile || cleanMobile.length < 5) {
      throw new Error('Invalid mobile phone number');
    }

    // Check if this mobile is already bound to another account
    const existing = await User.findOne({
      mobile: fullMobile,
      _id: { $ne: new mongoose.Types.ObjectId(userId) },
    });

    if (existing) {
      throw new Error('This phone number is already bound to another account');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    AppLogger.info(`[AccountSecurity] Generated binding OTP ${otp} for user ${userId} and mobile ${fullMobile}`);

    return {
      message: 'OTP sent successfully',
      fullMobile,
      // In non-production or for testing ease, return OTP
      otp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    };
  }

  /**
   * Verify OTP and bind the mobile phone number
   */
  public async bindMobile(userId: string, mobile: string, extension: string = '+91', otp: string) {
    const cleanExtension = extension.startsWith('+') ? extension : `+${extension}`;
    const cleanMobile = mobile.replace(/[^0-9]/g, '');
    const fullMobile = `${cleanExtension}${cleanMobile}`;

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.otp || user.otp !== otp.trim()) {
      throw new Error('Invalid OTP');
    }

    if (!user.otpExpires || new Date() > user.otpExpires) {
      throw new Error('OTP has expired. Please request a new one');
    }

    // Double check uniqueness
    const existing = await User.findOne({
      mobile: fullMobile,
      _id: { $ne: new mongoose.Types.ObjectId(userId) },
    });

    if (existing) {
      throw new Error('This phone number is already bound to another account');
    }

    user.mobile = fullMobile;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    return this.getSecurityStatus(userId);
  }

  /**
   * Bind or update email address
   */
  public async bindEmail(userId: string, email: string) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      throw new Error('Invalid email address format');
    }

    const existing = await User.findOne({
      email: cleanEmail,
      _id: { $ne: new mongoose.Types.ObjectId(userId) },
    });

    if (existing) {
      throw new Error('This email address is already bound to another account');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.email = cleanEmail;
    await user.save();

    return this.getSecurityStatus(userId);
  }

  /**
   * Bind Google account
   */
  public async bindGoogle(userId: string, googleId: string, email?: string) {
    if (!googleId || !googleId.trim()) {
      throw new Error('Google ID is required');
    }

    const trimmedGoogleId = googleId.trim();

    const existing = await User.findOne({
      googleId: trimmedGoogleId,
      _id: { $ne: new mongoose.Types.ObjectId(userId) },
    });

    if (existing) {
      throw new Error('This Google account is already bound to another user');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.googleId = trimmedGoogleId;
    if (email && (!user.email || user.email.trim().length === 0)) {
      user.email = email.trim().toLowerCase();
    }
    await user.save();

    return this.getSecurityStatus(userId);
  }

  /**
   * Unbind Google account
   */
  public async unbindGoogle(userId: string) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Must have at least one other login method
    const hasOther = Boolean(
      (user.mobile && user.mobile.trim().length > 0) ||
      (user.email && user.password) ||
      user.facebookId ||
      user.appleId
    );

    if (!hasOther) {
      throw new Error('Cannot unbind Google. You must bind a mobile number or email password first.');
    }

    user.googleId = undefined;
    await user.save();

    return this.getSecurityStatus(userId);
  }

  /**
   * Bind Facebook account
   */
  public async bindFacebook(userId: string, facebookId: string) {
    if (!facebookId || !facebookId.trim()) {
      throw new Error('Facebook ID is required');
    }

    const trimmedFbId = facebookId.trim();

    const existing = await User.findOne({
      facebookId: trimmedFbId,
      _id: { $ne: new mongoose.Types.ObjectId(userId) },
    });

    if (existing) {
      throw new Error('This Facebook account is already bound to another user');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.facebookId = trimmedFbId;
    await user.save();

    return this.getSecurityStatus(userId);
  }

  /**
   * Unbind Facebook account
   */
  public async unbindFacebook(userId: string) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const hasOther = Boolean(
      (user.mobile && user.mobile.trim().length > 0) ||
      (user.email && user.password) ||
      user.googleId ||
      user.appleId
    );

    if (!hasOther) {
      throw new Error('Cannot unbind Facebook. You must bind a mobile number or Google account first.');
    }

    user.facebookId = undefined;
    await user.save();

    return this.getSecurityStatus(userId);
  }

  /**
   * Set or change login password
   */
  public async setPassword(userId: string, newPassword: string, oldPassword?: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // If user already has a password, verify old password
    if (user.password && user.password.length > 0) {
      if (!oldPassword) {
        throw new Error('Current password is required');
      }
      const isValid = await bcrypt.compare(oldPassword, user.password);
      if (!isValid) {
        throw new Error('Current password is incorrect');
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    return {
      message: 'Password updated successfully',
      hasPassword: true,
    };
  }
}
