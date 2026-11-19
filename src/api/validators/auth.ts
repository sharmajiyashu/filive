import { z } from 'zod';

export const sendOtpSchema = z.object({
    extension: z.string().optional().default('91').transform(s => (s || '91').toString().replace(/[\s\-\+]/g, '')),
    mobile: z.string().transform(s => s.toString().replace(/[\s\-\+]/g, '')).refine(s => /^\d{7,15}$/.test(s), "Mobile number must be 7 to 15 digits"),
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
    extension: z.string().optional().default('91').transform(s => (s || '91').toString().replace(/[\s\-\+]/g, '')),
    mobile: z.string().transform(s => s.toString().replace(/[\s\-\+]/g, '')).refine(s => /^\d{7,15}$/.test(s), "Mobile number must be 7 to 15 digits"),
    otp: z.string().transform(s => s.toString().trim()).refine(s => /^\d{4,6}$/.test(s), "OTP must be 4 to 6 digits"),
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
