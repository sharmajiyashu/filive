import { z } from 'zod';

export const sendOtpSchema = z.object({
    extension: z.string().transform(s => s.replace(/^\+/, '')).refine(s => /^\d{1,4}$/.test(s), "Invalid extension (e.g. 91)"),
    mobile: z.string().min(7, "Mobile number must be at least 7 digits").max(15, "Mobile number cannot exceed 15 digits").regex(/^\d+$/, "Mobile number must contain only digits"),
    countryId: z.string().optional(),
    countryCode: z.string().optional(),
    referredBy: z.string().optional(),
    appType: z.string().optional(),
    registerIn: z.string().optional(),
    loginIn: z.string().optional(),
    deviceId: z.string().optional(),
    deviceModel: z.string().optional(),
});

export const verifyOtpSchema = z.object({
    extension: z.string().transform(s => s.replace(/^\+/, '')).refine(s => /^\d{1,4}$/.test(s), "Invalid extension (e.g. 91)"),
    mobile: z.string().min(7, "Mobile number must be at least 7 digits").max(15, "Mobile number cannot exceed 15 digits").regex(/^\d+$/, "Mobile number must contain only digits"),
    otp: z.string().length(4, "OTP must be 4 digits").regex(/^\d+$/, "OTP must contain only digits"),
    appType: z.string().optional(),
    registerIn: z.string().optional(),
    loginIn: z.string().optional(),
    deviceId: z.string().optional(),
    deviceModel: z.string().optional(),
});

export const userRegisterSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address").optional(),
    mobile: z.string().optional(),
    password: z.string().min(6, "Password must be at least 6 characters").optional(),
    gender: z.enum(['Male', 'Female', 'Other']).optional(),
    dob: z.string().optional(),
    appType: z.string().optional(),
    registerIn: z.string().optional(),
    referralCode: z.string().optional(),
    referredBy: z.string().optional(),
    deviceId: z.string().optional(),
    deviceModel: z.string().optional(),
});

export const userLoginSchema = z.object({
    email: z.string().optional(),
    mobile: z.string().optional(),
    password: z.string().min(1, "Password is required"),
    appType: z.string().optional(),
    loginIn: z.string().optional(),
    deviceId: z.string().optional(),
    deviceModel: z.string().optional(),
});

export const adminLoginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
});

export const googleLoginSchema = z.object({
    idToken: z.string().optional(),
    accessToken: z.string().optional(),
    email: z.string().email().optional(),
    name: z.string().optional(),
    googleId: z.string().optional(),
    photoUrl: z.string().optional(),
    countryId: z.string().optional(),
    countryCode: z.string().optional(),
    referredBy: z.string().optional(),
    extension: z.string().optional(),
    ipCountry: z.string().optional(),
    appType: z.string().optional(),
    registerIn: z.string().optional(),
    loginIn: z.string().optional(),
    deviceId: z.string().optional(),
    deviceModel: z.string().optional(),
});

export const facebookLoginSchema = z.object({
    accessToken: z.string().optional(),
    email: z.string().email().optional(),
    name: z.string().optional(),
    facebookId: z.string().optional(),
    photoUrl: z.string().optional(),
    countryId: z.string().optional(),
    countryCode: z.string().optional(),
    referredBy: z.string().optional(),
    extension: z.string().optional(),
    ipCountry: z.string().optional(),
    appType: z.string().optional(),
    registerIn: z.string().optional(),
    loginIn: z.string().optional(),
    deviceId: z.string().optional(),
    deviceModel: z.string().optional(),
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type UserRegisterInput = z.infer<typeof userRegisterSchema>;
export type UserLoginInput = z.infer<typeof userLoginSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
export type FacebookLoginInput = z.infer<typeof facebookLoginSchema>;
