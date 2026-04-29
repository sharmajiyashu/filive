import { Inject, Service } from "typedi";
import mongoose from "mongoose";
import User, { IUser } from '../../models/User';
import bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import config from "../../config";
import { EmailService } from "./emailService";
import { CONSTANTS } from "../../config/constants";
import { addMinutes } from "date-fns";
import AppLogger from '../../api/loaders/logger';


@Service()
export class AuthenticationService {
    constructor(
        @Inject('mongoConnection') private mongoConnection: typeof mongoose,
        @Inject() private emailService: EmailService,
    ) { }

    private generateToken(userId: string, role: string): string {
        const payload = { userId, role };
        const secret = config.auth.secret;
        const options: jwt.SignOptions = {
            expiresIn: CONSTANTS.JWT_ACCESS_EXPIRY
        };
        return jwt.sign(payload, secret, options) as string;
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
        }).populate('profileImage');

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

        return { token: '', user }; // Return empty token, must verify first
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

        const token = this.generateToken(user._id.toString(), user.userRole);

        // Update last login
        user.lastLoginAt = new Date();
        await user.save();

        return { token, user };
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

        user.otp = undefined;
        user.otpExpires = undefined;
        user.lastLoginAt = new Date();
        await user.save();

        const token = this.generateToken(user._id.toString(), user.userRole);

        return { token, user };
    }

    async userSendOTP(mobile: string): Promise<{ otp: string }> {
        let user = await User.findOne({ mobile });

        const otp = this.generateOTP(4);
        const otpExpires = addMinutes(new Date(), CONSTANTS.OTP_EXPIRY_MINUTES);

        if (!user) {
            // Register new user with this mobile
            user = await User.create({
                name: 'User',
                mobile,
                otp,
                otpExpires,
                userRole: 'user',
            });
        } else {
            // Update existing user with new OTP
            user.otp = otp;
            user.otpExpires = otpExpires;
            await user.save();
        }

        // Mock: In production, send this via SMS service provider
        AppLogger.info(`Sending OTP ${otp} to mobile ${mobile}`);

        return { otp }; // Return for testing/dev purposes if needed
    }

    async userVerifyOTP(mobile: string, otp: string): Promise<{ token: string; user: IUser }> {
        const user = await User.findOne({
            mobile,
            otp,
            otpExpires: { $gt: new Date() }
        }).populate('profileImage');

        if (!user) {
            throw new Error('Invalid or expired OTP');
        }

        // Clear OTP after successful verification
        user.otp = undefined;
        user.otpExpires = undefined;
        user.lastLoginAt = new Date();
        await user.save();

        const token = this.generateToken(user._id.toString(), user.userRole);

        return { token, user };
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
            const decoded = jwt.verify(token, config.auth.secret) as { userId: string };

            const user = await User.findById(decoded.userId);

            if (!user) {
                throw new Error('User not found');
            }

            return user;
        } catch (error) {
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
}
