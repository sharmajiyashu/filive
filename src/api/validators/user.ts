import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().optional(),
  gender: z.enum(['Male', 'Female', 'Other']).optional(),
  dob: z.string().optional(), // Can be string then converted to Date
});
