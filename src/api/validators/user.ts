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
  selfIntroduce: z.string().optional(),
  height: z.string().optional(),
  weight: z.string().optional(),
  careerId: z.string().optional(),
  emotionalStatus: z.enum(['single', 'divorced', 'married', 'secret', 'inlove']).optional(),
  country: z.string().optional(),
  nationality: z.string().optional(),
  hobbies: z.array(z.string()).optional(),
  maritalStatus: z.string().optional(),
  notificationPreferences: z.object({
    inApp: z.boolean().optional(),
    newMessage: z.boolean().optional(),
    vibrations: z.boolean().optional(),
  }).optional(),
  privacySettings: z.object({
    hideWealthLevel: z.boolean().optional(),
    hideCharmLevel: z.boolean().optional(),
    anonymousRanking: z.boolean().optional(),
  }).optional(),
});
