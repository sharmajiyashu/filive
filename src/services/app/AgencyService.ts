import { Service, Inject } from 'typedi';
import Agency from '../../models/Agency';
import AgencyHost from '../../models/AgencyHost';
import User from '../../models/User';
import { addMinutes } from 'date-fns';
import { CONSTANTS } from '../../config/constants';
import AppLogger from '../../api/loaders/logger';
import mongoose from 'mongoose';

export interface IAgencyHostDetail {
  id: string;
  agencyId: string;
  status: string;
  requestedBy: string;
  createdAt: Date;
  user: {
    id: string;
    userId: number;
    name: string;
    profileImage: any;
    email: string;
    mobile: string;
    countryId: string;
    isPremium: boolean;
  } | null;
}

@Service()
export class AgencyService {
  constructor() { }

  private async findAgencyByIdentifier(identifier: string) {
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      const agencyById = await Agency.findById(identifier);
      if (agencyById) return agencyById;

      const agencyByCreator = await Agency.findOne({ creatorId: identifier });
      if (agencyByCreator) return agencyByCreator;
    }

    const numericId = Number(identifier);
    if (!Number.isNaN(numericId)) {
      const owner = await User.findOne({ userId: numericId });
      if (owner) {
        const agency = await Agency.findOne({ creatorId: owner._id });
        if (agency) return agency;
      }
    }

    return null;
  }

  private async acceptUserAsHost(userId: string, agencyId: mongoose.Types.ObjectId) {
    const existing = await AgencyHost.findOne({ agencyId, userId });

    if (existing && existing.status === 'ACCEPTED') {
      throw new Error('You are already a host in this agency');
    }

    if (existing) {
      existing.status = 'ACCEPTED';
      existing.requestedBy = 'USER';
      await existing.save();
      const popExisting = await existing.populate('userId');
      return this.mapHostResponse(popExisting);
    }

    const host = await AgencyHost.create({
      agencyId,
      userId: new mongoose.Types.ObjectId(userId),
      status: 'ACCEPTED',
      requestedBy: 'USER'
    });
    const populated = await host.populate('userId');
    return this.mapHostResponse(populated);
  }

  private mapHostResponse(host: any): IAgencyHostDetail {
    return {
      id: host._id,
      agencyId: host.agencyId,
      status: host.status,
      requestedBy: host.requestedBy,
      createdAt: host.createdAt,
      user: host.userId ? {
        id: host.userId._id,
        userId: host.userId.userId,
        name: host.userId.name,
        profileImage: host.userId.profileImage,
        email: host.userId.email,
        mobile: host.userId.mobile,
        countryId: host.userId.countryId,
        isPremium: host.userId.isPremium,
      } : null
    };
  }

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

  public async getAgencies(filter: any = {}) {
    return await Agency.find({ ...filter, isVerified: true, status: 'approved' }).populate('countryId').populate('creatorId', 'name profileImage');
  }

  public async getAgency(id: string) {
    const agency = await Agency.findById(id).populate('countryId').populate('creatorId', 'name profileImage');
    if (!agency) throw new Error('Agency not found');
    return agency;
  }

  public async requestToJoinAgency(userId: string, agencyId: string) {
    const existing = await AgencyHost.findOne({ agencyId, userId });
    if (existing) {
      if (existing.status === 'ACCEPTED') throw new Error('Already a host in this agency');
      existing.status = 'ACCEPTED';
      existing.requestedBy = 'USER';
      await existing.save();
      const popExisting = await existing.populate('userId');
      return this.mapHostResponse(popExisting);
    }

    const request = await AgencyHost.create({
      agencyId: new mongoose.Types.ObjectId(agencyId),
      userId: new mongoose.Types.ObjectId(userId),
      status: 'ACCEPTED',
      requestedBy: 'USER'
    });
    const populated = await request.populate('userId');
    return this.mapHostResponse(populated);
  }

  public async handleJoinRequest(agencyId: string, adminUserId: string, requestId: string, status: 'ACCEPTED' | 'REJECTED') {
    const agency = await Agency.findById(agencyId);
    if (!agency || agency.creatorId.toString() !== adminUserId) {
      throw new Error('Unauthorized or agency not found');
    }

    const request = await AgencyHost.findById(requestId);
    if (!request || request.agencyId.toString() !== agencyId) {
      throw new Error('Request not found');
    }

    request.status = status;
    await request.save();
    const populated = await request.populate('userId');
    return this.mapHostResponse(populated);
  }

  public async addHostToAgency(agencyId: string, adminUserId: string, targetUserId: string, verificationCode: string) {
    const agency = await Agency.findById(agencyId);
    if (!agency || agency.creatorId.toString() !== adminUserId) {
      throw new Error('Unauthorized or agency not found');
    }

    const userQuery = mongoose.Types.ObjectId.isValid(targetUserId) ? { _id: targetUserId } : { userId: Number(targetUserId) };
    const targetUser = await User.findOne(userQuery);
    if (!targetUser) throw new Error('User not found');
    
    if (targetUser.hostVerificationCode !== verificationCode) {
      throw new Error('Invalid verification code');
    }

    const existing = await AgencyHost.findOne({ agencyId, userId: targetUser._id });
    if (existing && existing.status === 'ACCEPTED') {
      throw new Error('User is already a host in this agency');
    }

    if (existing) {
      existing.status = 'ACCEPTED';
      existing.requestedBy = 'AGENCY';
      await existing.save();
      const popExisting = await existing.populate('userId');
      return this.mapHostResponse(popExisting);
    }

    const host = await AgencyHost.create({
      agencyId: new mongoose.Types.ObjectId(agencyId),
      userId: targetUser._id,
      status: 'ACCEPTED',
      requestedBy: 'AGENCY'
    });
    const populated = await host.populate('userId');
    return this.mapHostResponse(populated);
  }

  public async getAgencyHosts(agencyId: string, adminUserId: string, page: number = 1, limit: number = 10) {
    const agency = await Agency.findById(agencyId);
    if (!agency || agency.creatorId.toString() !== adminUserId) {
      throw new Error('Unauthorized or agency not found');
    }
    const skip = (page - 1) * limit;
    const hosts = await AgencyHost.find({ agencyId, status: 'ACCEPTED' })
      .populate('userId')
      .skip(skip)
      .limit(limit);
      
    const total = await AgencyHost.countDocuments({ agencyId, status: 'ACCEPTED' });

    return {
      data: hosts.map(h => this.mapHostResponse(h)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  public async getAgencyPendingRequests(agencyId: string, adminUserId: string, page: number = 1, limit: number = 10) {
    const agency = await Agency.findById(agencyId);
    if (!agency || agency.creatorId.toString() !== adminUserId) {
      throw new Error('Unauthorized or agency not found');
    }
    const skip = (page - 1) * limit;
    const requests = await AgencyHost.find({ agencyId, status: 'PENDING', requestedBy: 'USER' })
      .populate('userId')
      .skip(skip)
      .limit(limit);
      
    const total = await AgencyHost.countDocuments({ agencyId, status: 'PENDING', requestedBy: 'USER' });

    return {
      data: requests.map(r => this.mapHostResponse(r)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  public async getUserAgencyRequests(userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const requests = await AgencyHost.find({ userId })
      .populate('agencyId', 'name description countryId isVerified')
      .populate('userId')
      .skip(skip)
      .limit(limit);
      
    const total = await AgencyHost.countDocuments({ userId });

    return {
      data: requests.map(r => {
        const mapped = this.mapHostResponse(r);
        (mapped as any).agency = r.agencyId; // Include agency details for user view
        return mapped;
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  public async verifyUserForHost(userId: number, adminUserId: string, agencyId: string) {
    const targetUser = await User.findOne({ userId });
    if (!targetUser) throw new Error('User not found');
    
    if (agencyId) {
      const agencyQuery = mongoose.Types.ObjectId.isValid(agencyId) ? { _id: agencyId } : { creatorId: agencyId };
      const agency = await Agency.findOne(agencyQuery);
      if (!agency || agency.creatorId.toString() !== adminUserId) {
        throw new Error('Unauthorized or agency not found');
      }

      const existing = await AgencyHost.findOne({ agencyId: agency._id, userId: targetUser._id });
      if (existing && existing.status === 'ACCEPTED') {
        throw new Error('User is already a host in this agency');
      }

      if (existing) {
        existing.status = 'ACCEPTED';
        existing.requestedBy = 'AGENCY';
        await existing.save();
      } else {
        await AgencyHost.create({
          agencyId: agency._id,
          userId: targetUser._id,
          status: 'ACCEPTED',
          requestedBy: 'AGENCY'
        });
      }
    }

    return {
      id: targetUser._id,
      userId: targetUser.userId,
      name: targetUser.name,
      profileImage: targetUser.profileImage,
      email: targetUser.email,
      mobile: targetUser.mobile,
      countryId: targetUser.countryId,
      isPremium: targetUser.isPremium,
    };
  }

  public async userJoinAgency(currentUserId: string, agentId: string) {
    const agency = await this.findAgencyByIdentifier(agentId);
    if (!agency) {
      throw new Error('Agency not found');
    }

    return this.acceptUserAsHost(currentUserId, agency._id);
  }

  public async verifyAgencyUserId(numericUserId: number) {
    const user = await User.findOne({ userId: numericUserId }).populate('profileImage');
    if (!user) {
      throw new Error('User not found');
    }

    const agency = await Agency.findOne({ creatorId: user._id })
      .populate('countryId')
      .populate('creatorId', 'name profileImage userId');

    const userInfo = {
      id: user._id,
      userId: user.userId,
      name: user.name,
      profileImage: user.profileImage,
    };

    if (!agency) {
      return {
        hasAgency: false,
        user: userInfo,
        agency: null,
      };
    }

    return {
      hasAgency: true,
      user: userInfo,
      agency,
      isVerified: agency.isVerified,
      isApproved: agency.status === 'approved',
    };
  }

  public async joinAgencyByUserId(currentUserId: string, agencyUserId: number) {
    const owner = await User.findOne({ userId: agencyUserId });
    if (!owner) {
      throw new Error('Agency user not found');
    }

    const agency = await Agency.findOne({ creatorId: owner._id });
    if (!agency) {
      throw new Error('No agency found for this user');
    }

    if (!agency.isVerified || agency.status !== 'approved') {
      throw new Error('Agency is not verified or approved yet');
    }

    return this.acceptUserAsHost(currentUserId, agency._id);
  }
}
