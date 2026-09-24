import { z } from 'zod';

export const sendOtpSchema = z.object({
    extension: z.string().regex(/^\d{1,4}$/, "Invalid extension (e.g. 91)"),
    mobile: z.string().length(10, "Mobile number must be 10 digits").regex(/^\d+$/, "Mobile number must contain only digits"),
    countryId: z.string().optional(),
    countryCode: z.string().optional(),
    referredBy: z.string().optional(),
});

export const verifyOtpSchema = z.object({
    extension: z.string().regex(/^\d{1,4}$/, "Invalid extension (e.g. 91)"),
    mobile: z.string().length(10, "Mobile number must be 10 digits").regex(/^\d+$/, "Mobile number must contain only digits"),
    otp: z.string().length(4, "OTP must be 4 digits").regex(/^\d+$/, "OTP must contain only digits"),
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
});

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
export type FacebookLoginInput = z.infer<typeof facebookLoginSchema>;

