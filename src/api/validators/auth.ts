import { z } from 'zod';

export const sendOtpSchema = z.object({
    extension: z.string().regex(/^\d{1,4}$/, "Invalid extension (e.g. 91)"),
    mobile: z.string().length(10, "Mobile number must be 10 digits").regex(/^\d+$/, "Mobile number must contain only digits"),
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

export type SendOtpInput = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
