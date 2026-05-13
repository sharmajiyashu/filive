import { Service } from 'typedi';
import Family from '../../models/Family';
import FamilyMember from '../../models/FamilyMember';
import User from '../../models/User';
import AppSetting from '../../models/AppSetting';
import CoinHistory from '../../models/CoinHistory';
import Follow from '../../models/Follow';
import mongoose from 'mongoose';
import { CloudinaryService } from '../common/CloudinaryService';
import { MediaService } from '../common/MediaService';
import { MediaType } from '../../constants/enum';

@Service()
export class FamilyService {
  constructor(
    private cloudinaryService: CloudinaryService,
    private mediaService: MediaService
  ) { }

  async createFamily(userId: string, data: { name: string; announcement?: string; tags?: any }, file?: Express.Multer.File) {
    const setting = await AppSetting.findOne({ key: 'family_creation_charge' });
    const charge = setting ? (setting.value as number) : 3000;

    const user = await User.findById(userId);
    if (!user || user.coins < charge) {
      throw new Error('Insufficient coins to create a family');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Deduct coins
      await User.findByIdAndUpdate(userId, { $inc: { coins: -charge } }, { session });

      // 2. Log transaction
      await CoinHistory.create([{
        userId,
        amount: -charge,
        type: 'family_creation',
        description: `Created family: ${data.name}`
      }], { session });

      let imageId: mongoose.Types.ObjectId | undefined;
      if (file) {
        const uploadResults = await this.cloudinaryService.uploadMedia(MediaType.image, [file], 'families');
        const media = await this.mediaService.createMedia(uploadResults[0]);
        imageId = media._id as mongoose.Types.ObjectId;
      }

      const tags = typeof data.tags === 'string' ? (data.tags.startsWith('[') ? JSON.parse(data.tags) : [data.tags]) : (Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []));

      // 3. Create family
      const family = await Family.create([{
        ...data,
        tags,
        image: imageId,
        creatorId: userId,
        memberCount: 1
      }], { session });

      // 4. Add creator as member
      await FamilyMember.create([{
        familyId: family[0]._id,
        userId,
        role: 'creator'
      }], { session });

      await session.commitTransaction();
      return family[0];
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async editFamily(userId: string, familyId: string, data: { name?: string; announcement?: string; tags?: any }, file?: Express.Multer.File) {
    const family = await Family.findById(familyId);
    if (!family) throw new Error('Family not found');

    if (family.creatorId.toString() !== userId) {
      throw new Error('Only the creator can edit the family');
    }

    if (file) {
      const uploadResults = await this.cloudinaryService.uploadMedia(MediaType.image, [file], 'families');
      const media = await this.mediaService.createMedia(uploadResults[0]);
      (data as any).image = media._id;
    }

    if (data.tags) {
      data.tags = typeof data.tags === 'string' ? (data.tags.startsWith('[') ? JSON.parse(data.tags) : [data.tags]) : (Array.isArray(data.tags) ? data.tags : [data.tags]);
    }

    const updatedFamily = await Family.findByIdAndUpdate(familyId, { $set: data }, { new: true }).populate('image');
    return updatedFamily;
  }

  async getFamilyHall(userId: string, type?: 'friends' | 'populated', page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const userJoinedFamilies = await FamilyMember.find({ userId }).distinct('familyId');
    const userJoinedSet = new Set(userJoinedFamilies.map(id => id.toString()));

    if (type === 'populated') {
      const populatedRaw = await Family.find().populate('image').sort({ memberCount: -1 }).skip(skip).limit(limit);
      const total = await Family.countDocuments();
      
      const populated = await Promise.all(populatedRaw.map(async (f) => {
        const stats = await this.getFamilyGenderStats(f._id.toString());
        const familyObj = f.toObject();
        return {
          ...familyObj,
          isJoined: userJoinedSet.has(f._id.toString()),
          genderStats: stats,
          image: (familyObj.image as any)?.url || null
        };
      }));

      return {
        data: populated,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      };
    }

    if (type === 'friends') {
      const following = await Follow.find({ followerId: userId, status: 'accepted' }).distinct('followingId');
      const friendFamilyIds = await FamilyMember.find({ userId: { $in: following } }).distinct('familyId');
      
      const friendsFamilyRaw = await Family.find({ _id: { $in: friendFamilyIds } }).populate('image').skip(skip).limit(limit);
      const total = await Family.countDocuments({ _id: { $in: friendFamilyIds } });

      const friendsFamily = await Promise.all(friendsFamilyRaw.map(async (f) => {
        const stats = await this.getFamilyGenderStats(f._id.toString());
        const familyObj = f.toObject();
        return {
          ...familyObj,
          isJoined: userJoinedSet.has(f._id.toString()),
          genderStats: stats,
          image: (familyObj.image as any)?.url || null
        };
      }));

      return {
        data: friendsFamily,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      };
    }

    // Default: return top 10 of each without full pagination metadata
    const populatedRaw = await Family.find().populate('image').sort({ memberCount: -1 }).limit(10);
    const following = await Follow.find({ followerId: userId, status: 'accepted' }).distinct('followingId');
    const friendFamilyIds = await FamilyMember.find({ userId: { $in: following } }).distinct('familyId');
    const friendsFamilyRaw = await Family.find({ _id: { $in: friendFamilyIds } }).populate('image').limit(10);

    const populated = await Promise.all(populatedRaw.map(async (f) => {
      const stats = await this.getFamilyGenderStats(f._id.toString());
      const familyObj = f.toObject();
      return {
        ...familyObj,
        isJoined: userJoinedSet.has(f._id.toString()),
        genderStats: stats,
        image: (familyObj.image as any)?.url || null
      };
    }));

    const friendsFamily = await Promise.all(friendsFamilyRaw.map(async (f) => {
      const stats = await this.getFamilyGenderStats(f._id.toString());
      const familyObj = f.toObject();
      return {
        ...familyObj,
        isJoined: userJoinedSet.has(f._id.toString()),
        genderStats: stats,
        image: (familyObj.image as any)?.url || null
      };
    }));

    return {
      friendsFamily,
      populated
    };
  }


  private async getFamilyGenderStats(familyId: string) {
    const members = await FamilyMember.find({ familyId }).populate('userId', 'gender');
    const total = members.length;
    if (total === 0) return "No members";

    const males = members.filter(m => (m.userId as any)?.gender === 'Male').length;
    const females = members.filter(m => (m.userId as any)?.gender === 'Female').length;

    const malePercent = Math.round((males / total) * 100);
    const femalePercent = Math.round((females / total) * 100);

    if (malePercent >= femalePercent) {
      return `Male ${malePercent}%`;
    } else {
      return `Female ${femalePercent}%`;
    }
  }

  async joinFamily(userId: string, familyId: string) {
    // Check if already in a family (optional restriction)
    const existing = await FamilyMember.findOne({ userId, familyId });
    if (existing) throw new Error('Already a member of this family');

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await FamilyMember.create([{ familyId, userId, role: 'member' }], { session });
      await Family.findByIdAndUpdate(familyId, { $inc: { memberCount: 1 } }, { session });
      await session.commitTransaction();
      return { success: true };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async leaveFamily(userId: string, familyId: string) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const deleted = await FamilyMember.findOneAndDelete({ userId, familyId }, { session });
      if (deleted) {
        await Family.findByIdAndUpdate(familyId, { $inc: { memberCount: -1 } }, { session });
      }
      await session.commitTransaction();
      return { success: true };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async getFamilyDetails(familyId: string, userId?: string) {
    const family = await Family.findById(familyId)
      .populate('creatorId', 'name profileImage')
      .populate('image');
    if (!family) throw new Error('Family not found');

    const members = await FamilyMember.find({ familyId })
      .populate({
        path: 'userId',
        select: 'name profileImage dob gender bio location country maritalStatus selfIntroduce height',
        populate: { path: 'profileImage' }
      });

    const memberDetails = members.map(m => {
      const user = m.userId as any;
      if (!user) return null;
      const age = user.dob ? Math.floor((new Date().getTime() - new Date(user.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
      return {
        id: user._id,
        name: user.name,
        profileImage: user.profileImage?.url || null,
        age,
        gender: user.gender,
        bio: user.bio,
        location: user.location,
        country: user.country,
        maritalStatus: user.maritalStatus,
        selfIntroduce: user.selfIntroduce,
        height: user.height,
        role: m.role,
        joinedAt: m.joinedAt
      };
    }).filter(m => m !== null);

    const genderStats = await this.getFamilyGenderStats(familyId);

    let isJoined = false;
    if (userId) {
      const membership = await FamilyMember.findOne({ familyId, userId });
      isJoined = !!membership;
    }

    const familyObj = family.toObject();
    return {
      family: {
        ...familyObj,
        isJoined,
        genderStats,
        image: (familyObj.image as any)?.url || null
      },
      totalMembers: family.memberCount,
      members: memberDetails
    };
  }
}
