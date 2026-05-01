import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().optional(),
  bio: z.string().optional(),
  gender: z.enum(['Male', 'Female', 'Other']).optional(),
  dob: z.string().optional(),
  location: z.object({
    lat: z.number().optional(),
    lng: z.number().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipcode: z.string().optional(),
  }).optional(),
});
