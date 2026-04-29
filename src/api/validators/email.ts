import { z } from 'zod';

export const emailOptionsSchema = z.object({
    to: z.string().email(),
    subject: z.string(),
    htmlBody: z.string(),
})

export const secretEmailOptionsSchema = z.object({
    to: z.string().email(),
    secret: z.string(),
    purpose: z.string()
})

export type EmailOptions = z.infer<typeof emailOptionsSchema>;
export type SecretEmailOptions = z.infer<typeof secretEmailOptionsSchema>;

