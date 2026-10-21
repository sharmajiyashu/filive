import { Container, Inject, Service } from "typedi";
import mongoose from "mongoose";
import axios from "axios";
import User, { IUser } from '../../models/User';
import { BannedDevice } from '../../models/BannedDevice';
import Follow from '../../models/Follow';
import bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import config from "../../config";
import { EmailService } from "./emailService";
import { AppSettingService } from "./AppSettingService";
import { CONSTANTS } from "../../config/constants";
import { addMinutes } from "date-fns";
import AppLogger from '../../api/loaders/logger';
import { ensureUserReferralCode, getReferralDeepLink } from '../../utils/referral';
import { resolveCountryFromSignals, isoFromDialCode } from '../../utils/phoneCountry';


@Service()
export class AuthenticationService {
    constructor(
        @Inject('mongoConnection') private mongoConnection: typeof mongoose,
        @Inject() private emailService: EmailService,
        @Inject() private appSettingService: AppSettingService,
    ) { }

    private generateToken(userId: string, role: string): string {
        const payload = { userId, role };
        const secret = config.auth.secret;
        if (role === 'admin') {
            return jwt.sign(payload, secret, { expiresIn: CONSTANTS.JWT_ADMIN_ACCESS_EXPIRY }) as string;
        }
        // Lifetime token for app users (never expires until user logs out)
        return jwt.sign(payload, secret, { expiresIn: '36500d' }) as string;
    }

    /**
     * Checks if the device is banned in BannedDevice collection or across users.
     * Throws DEVICE_BANNED error if device is banned.
     */
    public async assertDeviceNotBanned(deviceId?: string): Promise<void> {
        if (!deviceId || typeof deviceId !== 'string') return;
        const trimmed = deviceId.trim();
        if (!trimmed) return;

        const bannedRecord = await BannedDevice.findOne({ deviceId: trimmed, isActive: true });
        if (bannedRecord) {
            throw new Error(`DEVICE_BANNED: This device has been banned from accessing FiLive (${bannedRecord.reason || 'Device Banned by Admin'}). You cannot create accounts or log in from this device.`);
        }

        const bannedUser = await User.findOne({ deviceId: trimmed, deviceBan: true });
        if (bannedUser) {
            await BannedDevice.findOneAndUpdate(
                { deviceId: trimmed },
                { deviceId: trimmed, bannedByUserId: bannedUser._id, isActive: true, reason: 'Device Banned by Admin' },
                { upsert: true }
            );
            throw new Error(`DEVICE_BANNED: This device has been banned from accessing FiLive. You cannot create accounts or log in from this device.`);
        }
    }

    /** Auto-clears expired temporary blocks; throws ACCOUNT_BLOCKED or DEVICE_BANNED for active restrictions (app users only). */
    private async assertUserNotBlocked(user: IUser, incomingDeviceId?: string): Promise<IUser> {
        if (!user || user.userRole !== 'user') {
            return user;
        }

        const deviceToCheck = incomingDeviceId || user.deviceId;
        if (deviceToCheck) {
            await this.assertDeviceNotBanned(deviceToCheck);
        }

        if (user.deviceBan) {
            if (deviceToCheck) {
                await BannedDevice.findOneAndUpdate(
                    { deviceId: deviceToCheck.trim() },
                    { deviceId: deviceToCheck.trim(), bannedByUserId: user._id, isActive: true, reason: 'Device Banned by Admin' },
                    { upsert: true }
                );
            }
            throw new Error(`DEVICE_BANNED: Your device has been banned from accessing FiLive (${user.blockReason || 'Device Banned by Admin'}). You cannot log in or register.`);
        }

        if (!user.isBlocked) {
            return user;
        }

        if (user.blockedUntil && new Date(user.blockedUntil).getTime() <= Date.now()) {
            user.isBlocked = false;
            user.blockedUntil = undefined;
            user.blockReason = undefined;
            user.instantBlock = false;
            user.deviceBan = false;
            await user.save();
            return user;
        }

        const reason = user.blockReason || 'Your account has been restricted by Admin';
        const until = user.blockedUntil
            ? ` Until: ${new Date(user.blockedUntil).toISOString()}`
            : ' This restriction is permanent.';
        throw new Error(`ACCOUNT_BLOCKED: ${reason}.${until}`);
    }


    private generateOTP(digits: number = 4): string {
        // Default OTP is 1234 as per user request
        if (digits === 4) return '1234';

        // Generates a random OTP if not 4 digits (or if we want real random later)
        const min = Math.pow(10, digits - 1);
        const max = Math.pow(10, digits) - 1;
        return Math.floor(min + Math.random() * (max - min + 1)).toString();
    }

    async adminLogin(email: string, password: string): Promise<{ token: string; user: IUser }> {
        const user = await User.findOne({
            email,
            userRole: 'admin'
        }).populate('profileImage').populate('adminRoleId');

        if (!user || !user.password) {
            throw new Error('Invalid email or password');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            throw new Error('Invalid email or password');
        }

        const token = this.generateToken(user._id.toString(), user.userRole);

        // Update last login
        user.lastLoginAt = new Date();
        await user.save();

        return { token, user };
    }

    async userRegister(data: {
        name: string;
        email: string;
        mobile: string;
        password?: string;
        location?: {
            lat?: number;
            lng?: number;
            address?: string;
            city?: string;
            state?: string;
            zipcode?: string;
        }
    }): Promise<{ token: string; user: IUser }> {
        const existingUser = await User.findOne({
            $or: [{ email: data.email }, { mobile: data.mobile }]
        });

        if (existingUser) {
            throw new Error('User with this email or mobile already exists');
        }

        const hashedPassword = data.password ? await bcrypt.hash(data.password, 10) : undefined;

        const user = await User.create({
            ...data,
            password: hashedPassword,
            userRole: 'user',
            authProvider: 'email',
        });

        // Send OTP via email
        const otp = this.generateOTP();
        const otpExpires = addMinutes(new Date(), CONSTANTS.OTP_EXPIRY_MINUTES);
        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save();

        try {
            await this.emailService.sendAuthOtpEmail({
                to: data.email,
                secret: otp,
                purpose: 'EMAIL_VERIFICATION'
            });
        } catch (error) {
            AppLogger.error(`Failed to send verification email to ${data.email}: ${error}`);
        }

        await user.populate('profileImage');

        const followersCount = await Follow.countDocuments({ followingId: user._id, status: 'accepted' });
        const followingCount = await Follow.countDocuments({ followerId: user._id, status: 'accepted' });

        return {
            token: '',
            user: {
                ...user.toObject(),
                followersCount,
                followingCount
            } as any
        }; // Return empty token, must verify first
    }

    async userLogin(email: string, password: string): Promise<{ token: string; user: IUser }> {
        const user = await User.findOne({
            email,
            userRole: 'user'
        }).populate('profileImage');

        if (!user || !user.password) {
            throw new Error('Invalid email or password');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            throw new Error('Invalid email or password');
        }

        await this.assertUserNotBlocked(user);

        const token = this.generateToken(user._id.toString(), user.userRole);

        // Update last login
        user.lastLoginAt = new Date();
        await user.save();

        const followersCount = await Follow.countDocuments({ followingId: user._id, status: 'accepted' });
        const followingCount = await Follow.countDocuments({ followerId: user._id, status: 'accepted' });

        return {
            token,
            user: {
                ...user.toObject(),
                followersCount,
                followingCount
            } as any
        };
    }

    async userVerifyEmail(email: string, otp: string): Promise<{ token: string; user: IUser }> {
        const user = await User.findOne({
            email,
            otp,
            otpExpires: { $gt: new Date() }
        }).populate('profileImage');

        if (!user) {
            throw new Error('Invalid or expired OTP');
        }

        await this.assertUserNotBlocked(user);

        user.otp = undefined;
        user.otpExpires = undefined;
        user.lastLoginAt = new Date();
        await user.save();

        const token = this.generateToken(user._id.toString(), user.userRole);

        const followersCount = await Follow.countDocuments({ followingId: user._id, status: 'accepted' });
        const followingCount = await Follow.countDocuments({ followerId: user._id, status: 'accepted' });

        return {
            token,
            user: {
                ...user.toObject(),
                followersCount,
                followingCount
            } as any
        };
    }

    async userSendOTP(
        mobile: string,
        countryId?: string,
        referredBy?: string,
        extras?: { countryCode?: string; extension?: string; ipCountry?: string; deviceId?: string; deviceModel?: string }
    ): Promise<{ otp: string }> {
        if (extras?.deviceId) {
            await this.assertDeviceNotBanned(extras.deviceId);
        }

        let user = await User.findOne({ mobile });
        if (user) {
            await this.assertUserNotBlocked(user, extras?.deviceId);
        }

        const otp = this.generateOTP(4);
        const otpExpires = addMinutes(new Date(), CONSTANTS.OTP_EXPIRY_MINUTES);
        const resolvedCountry = await resolveCountryFromSignals({
            countryId,
            countryCode: extras?.countryCode,
            extension: extras?.extension,
            ipCountry: extras?.ipCountry,
        });

        if (!user) {
            let referrerObjId: mongoose.Types.ObjectId | undefined = undefined;
            if (referredBy && referredBy.trim() !== '') {
                const refStr = referredBy.trim();
                let referrerUser = null;
                if (mongoose.Types.ObjectId.isValid(refStr)) {
                    referrerUser = await User.findById(refStr);
                }
                if (!referrerUser) {
                    const searchNum = Number(refStr);
                    const searchConds: any[] = [
                        { referralCode: refStr },
                        { referCode: refStr }
                    ];
                    if (!isNaN(searchNum)) {
                        searchConds.push({ userId: searchNum });
                    }
                    referrerUser = await User.findOne({ $or: searchConds });
                }
                if (referrerUser) {
                    referrerObjId = referrerUser._id;
                }
            }

            const fallbackCode = extras?.countryCode || resolvedCountry?.country || isoFromDialCode(extras?.extension) || undefined;
            // Register new user with this mobile
            user = await User.create({
                name: 'User',
                mobile,
                otp,
                otpExpires,
                userRole: 'user',
                authProvider: 'phone',
                deviceId: extras?.deviceId,
                deviceModel: extras?.deviceModel,
                countryId: resolvedCountry?.countryId,
                country: resolvedCountry?.country || fallbackCode,
                countryCode: fallbackCode,
                referredBy: referrerObjId
            });

            await ensureUserReferralCode(user);
        } else {
            // Update existing user with new OTP
            user.otp = otp;
            user.otpExpires = otpExpires;
            if (extras?.deviceId) {
                user.deviceId = extras.deviceId;
            }
            if (extras?.deviceModel) {
                user.deviceModel = extras.deviceModel;
            }
            const fallbackCode = extras?.countryCode || resolvedCountry?.country || isoFromDialCode(extras?.extension) || undefined;
            if (!user.countryId && resolvedCountry?.countryId) {
                user.countryId = resolvedCountry.countryId;
            }
            if (!user.country && (resolvedCountry?.country || fallbackCode)) {
                user.country = resolvedCountry?.country || fallbackCode;
            }
            if (!user.countryCode && fallbackCode) {
                user.countryCode = fallbackCode;
            }
            if (!user.authProvider) {
                user.authProvider = 'phone';
            }
            await user.save();
        }

        // Mock: In production, send this via SMS service provider
        AppLogger.info(`Sending OTP ${otp} to mobile ${mobile}`);

        return { otp }; // Return for testing/dev purposes if needed
    }

    async userVerifyOTP(
        mobile: string,
        otp: string,
        deviceId?: string,
        deviceModel?: string
    ): Promise<{ token: string; user: IUser; isNewUser: boolean }> {
        if (deviceId) {
            await this.assertDeviceNotBanned(deviceId);
        }

        const user = await User.findOne({
            mobile,
            otp,
            otpExpires: { $gt: new Date() }
        }).populate('profileImage').populate('countryId');

        if (!user) {
            throw new Error('Invalid or expired OTP');
        }

        await this.assertUserNotBlocked(user, deviceId);

        // Clear OTP after successful verification
        const isNewUserVerification = !!user.referredBy;
        const isNewUser = (!user.lastLoginAt) || isNewUserVerification || (user.name === 'User' && !user.dob && !user.profileImage);
        const referrerId = user.referredBy ? user.referredBy.toString() : null;

        user.otp = undefined;
        user.otpExpires = undefined;
        user.referredBy = undefined; // Process only once
        user.lastLoginAt = new Date();
        if (deviceId) {
            user.deviceId = deviceId;
        }
        if (deviceModel) {
            user.deviceModel = deviceModel;
        }
        await user.save();

        if (isNewUserVerification && referrerId) {
            try {
                const { CoinService } = require('../app/CoinService');
                const coinService: any = Container.get(CoinService);
                await coinService.processReferralReward(referrerId, user._id.toString());
            } catch (err) {
                AppLogger.error(`Error rewarding referrer ${referrerId}: ${err}`);
            }
        }

        const token = this.generateToken(user._id.toString(), user.userRole);

        const followersCount = await Follow.countDocuments({ followingId: user._id, status: 'accepted' });
        const followingCount = await Follow.countDocuments({ followerId: user._id, status: 'accepted' });
        const { referralCode } = await ensureUserReferralCode(user);
        const deepLink = await getReferralDeepLink(referralCode);

        return {
            token,
            isNewUser,
            user: {
                ...user.toObject(),
                referralCode,
                referCode: referralCode,
                deepLink,
                followersCount,
                followingCount
            } as any
        };
    }

    async userForgotPassword(email: string): Promise<{ otp: string }> {
        const user = await User.findOne({ email });
        if (!user) {
            throw new Error('User with this email does not exist');
        }

        const otp = this.generateOTP();
        const otpExpires = addMinutes(new Date(), CONSTANTS.OTP_EXPIRY_MINUTES);

        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save();

        // Send OTP via email
        try {
            await this.emailService.sendAuthOtpEmail({
                to: email,
                secret: otp,
                purpose: 'RESET_PASSWORD'
            });
        } catch (error) {
            AppLogger.error(`Failed to send password reset email to ${email}: ${error}`);
            // In dev we still return OTP
        }

        return { otp };
    }

    async userResetPassword(data: { email: string; otp: string; newPassword: string }): Promise<void> {
        const user = await User.findOne({
            email: data.email,
            otp: data.otp,
            otpExpires: { $gt: new Date() }
        });

        if (!user) {
            throw new Error('Invalid or expired OTP');
        }

        const hashedPassword = await bcrypt.hash(data.newPassword, 10);
        user.password = hashedPassword;
        user.otp = undefined;
        user.otpExpires = undefined;

        await user.save();
    }

    async verifyToken(token: string): Promise<IUser> {
        try {
            const decoded = jwt.verify(token, config.auth.secret, { ignoreExpiration: true }) as { userId: string };

            const user = await User.findById(decoded.userId);

            if (!user) {
                throw new Error('User not found');
            }

            return await this.assertUserNotBlocked(user);
        } catch (error: any) {
            if (typeof error?.message === 'string' && error.message.startsWith('ACCOUNT_BLOCKED:')) {
                throw error;
            }
            throw new Error('Invalid or expired token');
        }
    }

    async resendOtp(data: { email?: string; mobile?: string }): Promise<void> {
        if (!data.email && !data.mobile) {
            throw new Error('Email or mobile is required');
        }

        const query = data.email ? { email: data.email } : { mobile: data.mobile };
        const user = await User.findOne(query);

        if (!user) {
            throw new Error('User not found');
        }

        const otp = this.generateOTP();
        const otpExpires = addMinutes(new Date(), CONSTANTS.OTP_EXPIRY_MINUTES);

        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save();

        if (data.email) {
            try {
                await this.emailService.sendAuthOtpEmail({
                    to: data.email,
                    secret: otp,
                    purpose: 'EMAIL_VERIFICATION'
                });
            } catch (error) {
                AppLogger.error(`Failed to resend OTP email to ${data.email}: ${error}`);
            }
        } else {
            // Mock: Send SMS
            AppLogger.info(`Resending mobile OTP ${otp} to ${data.mobile}`);
        }
    }

    /**
     * Google Login & Signup Verification
     */
    async googleAuth(payload: {
        idToken?: string;
        accessToken?: string;
        email?: string;
        name?: string;
        googleId?: string;
        photoUrl?: string;
        countryId?: string;
        countryCode?: string;
        referredBy?: string;
        extension?: string;
        ipCountry?: string;
        deviceId?: string;
        deviceModel?: string;
    }): Promise<{ token: string; user: IUser; isNewUser: boolean }> {
        if (payload.deviceId) {
            await this.assertDeviceNotBanned(payload.deviceId);
        }

        const settings = await this.appSettingService.getSettings();
        if (settings.google_login_enabled === false) {
            throw new Error('Google login is currently disabled by administrator');
        }

        let resolvedGoogleId = payload.googleId;
        let resolvedEmail = payload.email?.toLowerCase().trim();
        let resolvedName = payload.name;
        let resolvedPhotoUrl = payload.photoUrl;

        // Verify ID token via Google TokenInfo API if provided
        if (payload.idToken && payload.idToken.trim() !== '') {
            try {
                const response = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(payload.idToken)}`, {
                    timeout: 8000,
                });
                const gData = response.data;
                if (gData && (gData.sub || gData.user_id)) {
                    resolvedGoogleId = gData.sub || gData.user_id;
                    resolvedEmail = gData.email ? gData.email.toLowerCase().trim() : resolvedEmail;
                    resolvedName = gData.name || gData.given_name || resolvedName;
                    resolvedPhotoUrl = gData.picture || resolvedPhotoUrl;
                }
            } catch (err: any) {
                AppLogger.warn(`Google tokeninfo verification failed: ${err?.response?.data?.error_description || err?.message}`);
                // Fall back to accessToken if available
                if (payload.accessToken) {
                    try {
                        const userinfoRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
                            headers: { Authorization: `Bearer ${payload.accessToken}` },
                            timeout: 8000,
                        });
                        const uData = userinfoRes.data;
                        if (uData && uData.sub) {
                            resolvedGoogleId = uData.sub;
                            resolvedEmail = uData.email ? uData.email.toLowerCase().trim() : resolvedEmail;
                            resolvedName = uData.name || resolvedName;
                            resolvedPhotoUrl = uData.picture || resolvedPhotoUrl;
                        }
                    } catch (e: any) {
                        AppLogger.warn(`Google userinfo fallback failed: ${e?.message}`);
                    }
                }
            }
        } else if (payload.accessToken && payload.accessToken.trim() !== '') {
            try {
                const userinfoRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${payload.accessToken}` },
                    timeout: 8000,
                });
                const uData = userinfoRes.data;
                if (uData && uData.sub) {
                    resolvedGoogleId = uData.sub;
                    resolvedEmail = uData.email ? uData.email.toLowerCase().trim() : resolvedEmail;
                    resolvedName = uData.name || resolvedName;
                    resolvedPhotoUrl = uData.picture || resolvedPhotoUrl;
                }
            } catch (e: any) {
                AppLogger.warn(`Google userinfo via accessToken failed: ${e?.message}`);
            }
        }

        if (!resolvedGoogleId && !resolvedEmail) {
            throw new Error('Unable to authenticate with Google. Invalid or expired token.');
        }

        // Look for existing user by Google ID or by Email
        const searchConditions: any[] = [];
        if (resolvedGoogleId) {
            searchConditions.push({ googleId: resolvedGoogleId });
        }
        if (resolvedEmail) {
            searchConditions.push({ email: resolvedEmail });
        }

        let user = await User.findOne({ $or: searchConditions })
            .populate('profileImage')
            .populate('countryId');

        let isNewUser = false;

        if (user) {
            await this.assertUserNotBlocked(user, payload.deviceId);

            // Update user details if needed
            let hasChanges = false;
            if (payload.deviceId && (!user.deviceId || user.deviceId !== payload.deviceId)) {
                user.deviceId = payload.deviceId;
                if (payload.deviceModel) user.deviceModel = payload.deviceModel;
                hasChanges = true;
            }
            if (resolvedGoogleId && !user.googleId) {
                user.googleId = resolvedGoogleId;
                hasChanges = true;
            }
            if (!user.authProvider) {
                user.authProvider = 'google';
                hasChanges = true;
            }
            if ((!user.name || user.name === 'User') && resolvedName) {
                user.name = resolvedName;
                hasChanges = true;
            }
            if (!user.isVerified) {
                user.isVerified = true;
                hasChanges = true;
            }

            user.lastLoginAt = new Date();
            await user.save();
        } else {
            // New user registration via Google
            isNewUser = true;

            const resolvedCountry = await resolveCountryFromSignals({
                countryId: payload.countryId,
                countryCode: payload.countryCode,
                extension: payload.extension,
                ipCountry: payload.ipCountry,
            });

            let referrerObjId: mongoose.Types.ObjectId | undefined = undefined;
            if (payload.referredBy && payload.referredBy.trim() !== '') {
                const refStr = payload.referredBy.trim();
                let referrerUser = null;
                if (mongoose.Types.ObjectId.isValid(refStr)) {
                    referrerUser = await User.findById(refStr);
                }
                if (!referrerUser) {
                    const searchNum = Number(refStr);
                    const searchConds: any[] = [
                        { referralCode: refStr },
                        { referCode: refStr }
                    ];
                    if (!isNaN(searchNum)) {
                        searchConds.push({ userId: searchNum });
                    }
                    referrerUser = await User.findOne({ $or: searchConds });
                }
                if (referrerUser) {
                    referrerObjId = referrerUser._id;
                }
            }

            user = await User.create({
                name: resolvedName || 'Google User',
                email: resolvedEmail || undefined,
                googleId: resolvedGoogleId,
                authProvider: 'google',
                userRole: 'user',
                deviceId: payload.deviceId,
                deviceModel: payload.deviceModel,
                isVerified: true,
                countryId: resolvedCountry?.countryId,
                country: resolvedCountry?.country,
                lastLoginAt: new Date(),
                socialProfile: {
                    provider: 'google',
                    id: resolvedGoogleId,
                    photoUrl: resolvedPhotoUrl,
                }
            });

            await ensureUserReferralCode(user);

            // Process referral reward
            if (referrerObjId) {
                try {
                    const { CoinService } = require('../app/CoinService');
                    const coinService: any = Container.get(CoinService);
                    await coinService.processReferralReward(referrerObjId.toString(), user._id.toString());
                } catch (err) {
                    AppLogger.error(`Error rewarding referrer ${referrerObjId}: ${err}`);
                }
            }
        }

        const token = this.generateToken(user._id.toString(), user.userRole);
        const followersCount = await Follow.countDocuments({ followingId: user._id, status: 'accepted' });
        const followingCount = await Follow.countDocuments({ followerId: user._id, status: 'accepted' });
        const { referralCode } = await ensureUserReferralCode(user);
        const deepLink = await getReferralDeepLink(referralCode);

        return {
            token,
            isNewUser,
            user: {
                ...user.toObject(),
                referralCode,
                referCode: referralCode,
                deepLink,
                followersCount,
                followingCount,
            } as any,
        };
    }

    /**
     * Facebook Login & Signup Verification
     */
    async facebookAuth(payload: {
        accessToken: string;
        email?: string;
        name?: string;
        facebookId?: string;
        photoUrl?: string;
        countryId?: string;
        countryCode?: string;
        referredBy?: string;
        extension?: string;
        ipCountry?: string;
        deviceId?: string;
        deviceModel?: string;
    }): Promise<{ token: string; user: IUser; isNewUser: boolean }> {
        if (payload.deviceId) {
            await this.assertDeviceNotBanned(payload.deviceId);
        }

        const settings = await this.appSettingService.getSettings();
        if (settings.facebook_login_enabled === false) {
            throw new Error('Facebook login is currently disabled by administrator');
        }

        let resolvedFacebookId = payload.facebookId;
        let resolvedEmail = payload.email?.toLowerCase().trim();
        let resolvedName = payload.name;
        let resolvedPhotoUrl = payload.photoUrl;

        // Verify Facebook Access Token via Graph API
        if (payload.accessToken && payload.accessToken.trim() !== '') {
            try {
                const fbUrl = `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(payload.accessToken)}`;
                const response = await axios.get(fbUrl, { timeout: 8000 });
                const fbData = response.data;
                if (fbData && fbData.id) {
                    resolvedFacebookId = fbData.id;
                    resolvedName = fbData.name || resolvedName;
                    resolvedEmail = fbData.email ? fbData.email.toLowerCase().trim() : resolvedEmail;
                    resolvedPhotoUrl = fbData.picture?.data?.url || resolvedPhotoUrl;
                }
            } catch (err: any) {
                AppLogger.warn(`Facebook graph API verification failed: ${err?.response?.data?.error?.message || err?.message}`);
                if (!resolvedFacebookId) {
                    throw new Error('Invalid or expired Facebook access token.');
                }
            }
        }

        if (!resolvedFacebookId && !resolvedEmail) {
            throw new Error('Unable to authenticate with Facebook. Invalid token or credentials.');
        }

        // Look for existing user by Facebook ID or by Email
        const searchConditions: any[] = [];
        if (resolvedFacebookId) {
            searchConditions.push({ facebookId: resolvedFacebookId });
        }
        if (resolvedEmail) {
            searchConditions.push({ email: resolvedEmail });
        }

        let user = await User.findOne({ $or: searchConditions })
            .populate('profileImage')
            .populate('countryId');

        let isNewUser = false;

        if (user) {
            await this.assertUserNotBlocked(user, payload.deviceId);

            // Update user details if needed
            let hasChanges = false;
            if (payload.deviceId && (!user.deviceId || user.deviceId !== payload.deviceId)) {
                user.deviceId = payload.deviceId;
                if (payload.deviceModel) user.deviceModel = payload.deviceModel;
                hasChanges = true;
            }
            if (resolvedFacebookId && !user.facebookId) {
                user.facebookId = resolvedFacebookId;
                hasChanges = true;
            }
            if (!user.authProvider) {
                user.authProvider = 'facebook';
                hasChanges = true;
            }
            if ((!user.name || user.name === 'User') && resolvedName) {
                user.name = resolvedName;
                hasChanges = true;
            }
            if (!user.isVerified) {
                user.isVerified = true;
                hasChanges = true;
            }

            user.lastLoginAt = new Date();
            await user.save();
        } else {
            // New user registration via Facebook
            isNewUser = true;

            const resolvedCountry = await resolveCountryFromSignals({
                countryId: payload.countryId,
                countryCode: payload.countryCode,
                extension: payload.extension,
                ipCountry: payload.ipCountry,
            });

            let referrerObjId: mongoose.Types.ObjectId | undefined = undefined;
            if (payload.referredBy && payload.referredBy.trim() !== '') {
                const refStr = payload.referredBy.trim();
                let referrerUser = null;
                if (mongoose.Types.ObjectId.isValid(refStr)) {
                    referrerUser = await User.findById(refStr);
                }
                if (!referrerUser) {
                    const searchNum = Number(refStr);
                    const searchConds: any[] = [
                        { referralCode: refStr },
                        { referCode: refStr }
                    ];
                    if (!isNaN(searchNum)) {
                        searchConds.push({ userId: searchNum });
                    }
                    referrerUser = await User.findOne({ $or: searchConds });
                }
                if (referrerUser) {
                    referrerObjId = referrerUser._id;
                }
            }

            user = await User.create({
                name: resolvedName || 'Facebook User',
                email: resolvedEmail || undefined,
                facebookId: resolvedFacebookId,
                authProvider: 'facebook',
                userRole: 'user',
                deviceId: payload.deviceId,
                deviceModel: payload.deviceModel,
                isVerified: true,
                countryId: resolvedCountry?.countryId,
                country: resolvedCountry?.country,
                lastLoginAt: new Date(),
                socialProfile: {
                    provider: 'facebook',
                    id: resolvedFacebookId,
                    photoUrl: resolvedPhotoUrl,
                }
            });

            await ensureUserReferralCode(user);

            // Process referral reward
            if (referrerObjId) {
                try {
                    const { CoinService } = require('../app/CoinService');
                    const coinService: any = Container.get(CoinService);
                    await coinService.processReferralReward(referrerObjId.toString(), user._id.toString());
                } catch (err) {
                    AppLogger.error(`Error rewarding referrer ${referrerObjId}: ${err}`);
                }
            }
        }

        const token = this.generateToken(user._id.toString(), user.userRole);
        const followersCount = await Follow.countDocuments({ followingId: user._id, status: 'accepted' });
        const followingCount = await Follow.countDocuments({ followerId: user._id, status: 'accepted' });
        const { referralCode } = await ensureUserReferralCode(user);
        const deepLink = await getReferralDeepLink(referralCode);

        return {
            token,
            isNewUser,
            user: {
                ...user.toObject(),
                referralCode,
                referCode: referralCode,
                deepLink,
                followersCount,
                followingCount,
            } as any,
        };
    }

    /**
     * Apple Login & Signup Verification
     */
    async appleAuth(payload: {
        identityToken?: string;
        authorizationCode?: string;
        email?: string;
        name?: string;
        appleId?: string;
        photoUrl?: string;
        countryId?: string;
        countryCode?: string;
        referredBy?: string;
        extension?: string;
        ipCountry?: string;
        deviceId?: string;
        deviceModel?: string;
    }): Promise<{ token: string; user: IUser; isNewUser: boolean }> {
        if (payload.deviceId) {
            await this.assertDeviceNotBanned(payload.deviceId);
        }

        let resolvedAppleId = payload.appleId;
        let resolvedEmail = payload.email?.toLowerCase().trim();
        let resolvedName = payload.name;
        let resolvedPhotoUrl = payload.photoUrl;

        // If identityToken (JWT) is provided, decode payload to extract Apple sub / email
        if (payload.identityToken && payload.identityToken.trim() !== '') {
            try {
                const parts = payload.identityToken.split('.');
                if (parts.length === 3) {
                    const decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
                    if (decodedPayload.sub) {
                        resolvedAppleId = decodedPayload.sub;
                    }
                    if (decodedPayload.email && !resolvedEmail) {
                        resolvedEmail = decodedPayload.email.toLowerCase().trim();
                    }
                }
            } catch (err: any) {
                AppLogger.warn(`Apple identityToken decode error: ${err?.message}`);
            }
        }

        if (!resolvedAppleId && !resolvedEmail) {
            throw new Error('Unable to authenticate with Apple. Invalid or missing Apple user identity.');
        }

        const searchConditions: any[] = [];
        if (resolvedAppleId) {
            searchConditions.push({ appleId: resolvedAppleId });
        }
        if (resolvedEmail) {
            searchConditions.push({ email: resolvedEmail });
        }

        let user = await User.findOne({ $or: searchConditions })
            .populate('profileImage')
            .populate('countryId');

        let isNewUser = false;

        if (user) {
            await this.assertUserNotBlocked(user, payload.deviceId);

            if (payload.deviceId && (!user.deviceId || user.deviceId !== payload.deviceId)) {
                user.deviceId = payload.deviceId;
                if (payload.deviceModel) user.deviceModel = payload.deviceModel;
            }
            if (resolvedAppleId && !user.appleId) {
                user.appleId = resolvedAppleId;
            }
            if (resolvedName && (!user.name || user.name === 'User' || user.name === 'Apple User')) {
                user.name = resolvedName;
            }
            if (!user.authProvider) {
                user.authProvider = 'apple';
            }
            user.lastLoginAt = new Date();
            await user.save();
        } else {
            isNewUser = true;

            const resolvedCountry = await resolveCountryFromSignals({
                countryId: payload.countryId,
                countryCode: payload.countryCode,
                extension: payload.extension,
                ipCountry: payload.ipCountry,
            });

            let referrerObjId: mongoose.Types.ObjectId | undefined = undefined;
            if (payload.referredBy && payload.referredBy.trim() !== '') {
                const refStr = payload.referredBy.trim();
                let referrerUser = null;
                if (mongoose.Types.ObjectId.isValid(refStr)) {
                    referrerUser = await User.findById(refStr);
                }
                if (!referrerUser) {
                    const searchNum = Number(refStr);
                    const searchConds: any[] = [
                        { referralCode: refStr },
                        { referCode: refStr }
                    ];
                    if (!isNaN(searchNum)) {
                        searchConds.push({ userId: searchNum });
                    }
                    referrerUser = await User.findOne({ $or: searchConds });
                }
                if (referrerUser) {
                    referrerObjId = referrerUser._id;
                }
            }

            user = await User.create({
                name: resolvedName || (resolvedEmail ? resolvedEmail.split('@')[0] : 'Apple User'),
                email: resolvedEmail || undefined,
                appleId: resolvedAppleId,
                authProvider: 'apple',
                userRole: 'user',
                deviceId: payload.deviceId,
                deviceModel: payload.deviceModel,
                isVerified: true,
                countryId: resolvedCountry?.countryId,
                country: resolvedCountry?.country,
                lastLoginAt: new Date(),
                referredBy: referrerObjId,
                socialProfile: {
                    provider: 'apple',
                    id: resolvedAppleId,
                    photoUrl: resolvedPhotoUrl,
                }
            });

            if (referrerObjId) {
                try {
                    const { CoinService } = require('../app/CoinService');
                    const coinService: any = Container.get(CoinService);
                    await coinService.processReferralReward(referrerObjId.toString(), user._id.toString());
                } catch (err) {
                    AppLogger.error(`Error rewarding referrer ${referrerObjId}: ${err}`);
                }
            }
        }

        const token = this.generateToken(user._id.toString(), user.userRole);
        const followersCount = await Follow.countDocuments({ followingId: user._id, status: 'accepted' });
        const followingCount = await Follow.countDocuments({ followerId: user._id, status: 'accepted' });
        const { referralCode } = await ensureUserReferralCode(user);
        const deepLink = await getReferralDeepLink(referralCode);

        return {
            token,
            isNewUser,
            user: {
                ...user.toObject(),
                referralCode,
                referCode: referralCode,
                deepLink,
                followersCount,
                followingCount,
            } as any,
        };
    }

    /**
     * Get Client Safe Social Authentication Settings for Mobile App
     */
    async getSocialAuthSettings() {
        const settings = await this.appSettingService.getSettings();
        return {
            google: {
                enabled: settings.google_login_enabled !== false,
                clientId: settings.google_client_id || '',
                androidClientId: settings.google_android_client_id || '',
                iosClientId: settings.google_ios_client_id || '',
            },
            facebook: {
                enabled: settings.facebook_login_enabled !== false,
                appId: settings.facebook_app_id || '',
                clientToken: settings.facebook_client_token || '',
            },
            apple: {
                enabled: true,
            },
            phone: {
                enabled: settings.phone_login_enabled !== false,
            },
            email: {
                enabled: settings.email_login_enabled !== false,
            },
        };
    }

    async logout(userId: string, fcmToken?: string): Promise<void> {
        const user = await User.findById(userId);
        if (!user) return;

        if (fcmToken && user.fcmTokens) {
            user.fcmTokens = user.fcmTokens.filter(t => t.token !== fcmToken);
            await user.save();
        }
    }
}


