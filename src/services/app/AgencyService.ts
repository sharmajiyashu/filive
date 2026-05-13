import { Service, Inject } from 'typedi';
import Agency from '../../models/Agency';
import { addMinutes } from 'date-fns';
import { CONSTANTS } from '../../config/constants';
import AppLogger from '../../api/loaders/logger';
import mongoose from 'mongoose';

@Service()
export class AgencyService {
  constructor() { }

  private generateOTP(digits: number = 4): string {
    if (digits === 4) return '1234'; // Default as per previous pattern
    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    return Math.floor(min + Math.random() * (max - min + 1)).toString();
  }

  public async createAgency(userId: string, data: {
    name: string;
    countryId: string;
    mobile: string;
    email: string;
    description: string;
  }) {
    const existing = await Agency.findOne({ mobile: data.mobile });
    if (existing && existing.isVerified) {
      throw new Error('Agency with this mobile already exists and is verified');
    }

    const otp = this.generateOTP();
    const otpExpires = addMinutes(new Date(), CONSTANTS.OTP_EXPIRY_MINUTES);

    let agency;
    if (existing) {
      // Update existing unverified agency
      existing.name = data.name;
      existing.countryId = new mongoose.Types.ObjectId(data.countryId);
      existing.email = data.email;
      existing.description = data.description;
      existing.otp = otp;
      existing.otpExpires = otpExpires;
      existing.creatorId = new mongoose.Types.ObjectId(userId);
      await existing.save();
      agency = existing;
    } else {
      agency = await Agency.create({
        ...data,
        countryId: new mongoose.Types.ObjectId(data.countryId),
        creatorId: new mongoose.Types.ObjectId(userId),
        otp,
        otpExpires,
        isVerified: false
      });
    }

    // Mock: Send OTP via SMS
    AppLogger.info(`Sending Agency Verification OTP ${otp} to ${data.mobile}`);

    return {
      agencyId: agency._id,
      message: 'OTP sent to mobile number'
    };
  }

  public async verifyAgency(agencyId: string, otp: string) {
    const agency = await Agency.findOne({
      _id: agencyId,
      otp,
      otpExpires: { $gt: new Date() }
    });

    if (!agency) {
      throw new Error('Invalid or expired OTP');
    }

    agency.isVerified = true;
    agency.otp = undefined;
    agency.otpExpires = undefined;
    await agency.save();

    return agency;
  }
}
