import { Service } from 'typedi';
import Family from '../../models/Family';
import FamilyMember from '../../models/FamilyMember';
import User from '../../models/User';
import AppSetting from '../../models/AppSetting';
import CoinHistory from '../../models/CoinHistory';
import Follow from '../../models/Follow';
import mongoose from 'mongoose';

@Service()
export class FamilyService {
  async createFamily(userId: string, data: { name: string; announcement?: string; tags?: string[] }) {
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

      // 3. Create family
      const family = await Family.create([{
        ...data,
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

  async getFamilyHall(userId: string) {
    // 1. Populated Families (by member count)
    const populatedRaw = await Family.find().sort({ memberCount: -1 }).limit(10);

    // 2. Friends Families
    const following = await Follow.find({ followerId: userId, status: 'accepted' }).distinct('followingId');
    const friendFamilyIds = await FamilyMember.find({ userId: { $in: following } }).distinct('familyId');
    const friendsFamilyRaw = await Family.find({ _id: { $in: friendFamilyIds } }).limit(10);

    const populated = await Promise.all(populatedRaw.map(async (f) => {
      const stats = await this.getFamilyGenderStats(f._id.toString());
      return { ...f.toObject(), genderStats: stats };
    }));

    const friendsFamily = await Promise.all(friendsFamilyRaw.map(async (f) => {
      const stats = await this.getFamilyGenderStats(f._id.toString());
      return { ...f.toObject(), genderStats: stats };
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

  async getFamilyDetails(familyId: string) {
    const family = await Family.findById(familyId).populate('creatorId', 'name profileImage');
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

    return {
      family: { ...family.toObject(), genderStats },
      totalMembers: family.memberCount,
      members: memberDetails
    };
  }
}

export default new FamilyService();
