import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().optional(),
  bio: z.string().optional(),
  gender: z.enum(['Male', 'Female', 'Other']).optional(),
  dob: z.string().optional(),
  location: z.preprocess((val) => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return undefined;
      }
    }
    return val;
  }, z.object({
    lat: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number()).optional(),
    lng: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number()).optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipcode: z.string().optional(),
  })).optional(),
  selfIntroduce: z.string().optional(),
  height: z.string().optional(),
  weight: z.string().optional(),
  careerId: z.string().optional(),
  career: z.string().optional(),
  emotionalStatus: z.enum(['single', 'divorced', 'married', 'secret', 'inlove']).optional(),
  country: z.string().optional(),
  nationality: z.string().optional(),
  hobbies: z.preprocess((val) => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return val.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    }
    return val;
  }, z.array(z.string())).optional(),
  album: z.preprocess((val) => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return val.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    }
    return val;
  }, z.array(z.string())).optional(),
  maritalStatus: z.string().optional(),
  notificationPreferences: z.preprocess((val) => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return undefined;
      }
    }
    return val;
  }, z.object({
    inApp: z.preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean()).optional(),
    newMessage: z.preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean()).optional(),
    vibrations: z.preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean()).optional(),
  })).optional(),
  privacySettings: z.preprocess((val) => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return undefined;
      }
    }
    return val;
  }, z.object({
    hideWealthLevel: z.preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean()).optional(),
    hideCharmLevel: z.preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean()).optional(),
    anonymousRanking: z.preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean()).optional(),
  })).optional(),
  enableVoiceCall: z.preprocess((val) => {
    if (typeof val === 'string') return val === 'true';
    return val;
  }, z.boolean()).optional(),
  enableVideoCall: z.preprocess((val) => {
    if (typeof val === 'string') return val === 'true';
    return val;
  }, z.boolean()).optional(),
  voiceCallPrice: z.preprocess((val) => {
    if (typeof val === 'string') return Number(val);
    return val;
  }, z.number()).optional(),
  videoCallPrice: z.preprocess((val) => {
    if (typeof val === 'string') return Number(val);
    return val;
  }, z.number()).optional(),
});
