import { Service } from 'typedi';
import mongoose from 'mongoose';
import User from '../../models/User';
import Follow from '../../models/Follow';
import { CloudinaryService } from '../common/CloudinaryService';
import { MediaService } from '../common/MediaService';
import { MediaType } from '../../constants/enum';
import Career from '../../models/Career';
import Hobby from '../../models/Hobby';
import { LevelService } from './LevelService';
import UserVisitor from '../../models/UserVisitor';
import AgencyHost from '../../models/AgencyHost';
import Agency from '../../models/Agency';
import CoinHistory from '../../models/CoinHistory';
import { applyProfileDefaults } from './profileDefaults';
import { ensureUserReferralCode, getReferralDeepLink } from '../../utils/referral';
import { ACTIVE_STORE_POPULATE } from '../../utils/activeStorePopulate';

@Service()
export class ProfileService {
  constructor(
    private cloudinaryService: CloudinaryService,
    private mediaService: MediaService,
    private levelService: LevelService
  ) { }

  public async getProfile(userId: string) {
    const profile = await User.findById(userId)
      .populate('profileImage')
      .populate('album')
      .populate({
        path: 'hobbies',
        populate: { path: 'image' }
      })
      .populate({
        path: 'careerId',
        populate: { path: 'image' }
      })
      .populate([...ACTIVE_STORE_POPULATE] as any);
    if (!profile) {
      throw new Error('USER_NOT_FOUND');
    }

    const followersCount = await Follow.countDocuments({ followingId: userId, status: 'accepted' });
    const followingCount = await Follow.countDocuments({ followerId: userId, status: 'accepted' });
    const myFollowing = await Follow.find({ followerId: userId, status: 'accepted' }).select('followingId');
    const myFollowingIds = myFollowing.map(f => f.followingId);
    const friendsCount = await Follow.countDocuments({
      followingId: userId,
      followerId: { $in: myFollowingIds },
      status: 'accepted'
    });

    const visitorsCount = await UserVisitor.distinct('visitorId', { userId }).then(ids => ids.length);

    const richCoins = profile.wealthCoins !== undefined ? profile.wealthCoins : (profile.coins || 0);
    const charmCoins = profile.charmCoins || 0;
    const richLevelInfo = await this.levelService.getLevelInfoForCoins(richCoins, 'rich');
    const charmLevelInfo = await this.levelService.getLevelInfoForCoins(charmCoins, 'charm');

    const ownedAgency = await Agency.findOne({ creatorId: userId })
      .populate('countryId')
      .populate({ path: 'creatorId', select: 'name profileImage userId', populate: { path: 'profileImage' } });

    let agency: any = ownedAgency || null;
    let isAgencyHost = !!ownedAgency;
    let isBecomeHost = false;
    let becomeHostMessage: string | null = null;

    if (!ownedAgency) {
      const agencyHost = await AgencyHost.findOne({ userId, status: 'ACCEPTED' });
      if (agencyHost) {
        const joinedAgency = await Agency.findById(agencyHost.agencyId).select('name');
        isBecomeHost = true;
        becomeHostMessage = joinedAgency
          ? `You are a host under ${joinedAgency.name}.`
          : 'You have joined as an agency host.';
      }
    }

    const profileData = applyProfileDefaults(profile);
    const { referralCode } = await ensureUserReferralCode(profile);
    const deepLink = await getReferralDeepLink(referralCode);

    const AppSetting = mongoose.model('AppSetting');
    const rewardSetting = await AppSetting.findOne({ key: 'invite_reward_coins' });
    const inviteRewardCoins = rewardSetting ? Number(rewardSetting.value) : 2000;

    return {
      ...profileData,
      referralCode,
      referCode: referralCode,
      deepLink,
      inviteRewardCoins,
      career: profile.careerId,
      followersCount,
      followingCount,
      friendsCount,
      visitorsCount,
      levelInfo: richLevelInfo,
      richLevelInfo,
      charmLevelInfo,
      agency,
      isAgencyHost,
      isBecomeHost,
      becomeHostMessage,
    };
  }

  public async updateProfile(userId: string, data: any, file?: Express.Multer.File, albumFiles?: Express.Multer.File[]) {
    if (file) {
      const uploadResults = await this.cloudinaryService.uploadMedia(MediaType.image, [file], 'profiles');
      if (uploadResults.length > 0) {
        const media = await this.mediaService.createMedia({
          ...uploadResults[0]
        });
        data.profileImage = media._id;
      }
    }

    if (albumFiles && albumFiles.length > 0) {
      const uploadResults = await this.cloudinaryService.uploadMedia(MediaType.image, albumFiles, 'albums');
      const mediaIds = [];
      for (const result of uploadResults) {
        const media = await this.mediaService.createMedia({
          ...result
        });
        mediaIds.push(media._id);
      }
      data.$push = { album: { $each: mediaIds } };
    }

    if (data.dob) {
      const birthDate = new Date(data.dob);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      if (age < 18) {
        throw new Error('Users under 18 years of age are not allowed to register or use this platform.');
      }
      data.dob = birthDate;
    }

    // Parse JSON strings for multipart/form-data
    if (typeof data.hobbies === 'string') {
      try { data.hobbies = JSON.parse(data.hobbies); } catch (e) { data.hobbies = data.hobbies.split(',').map((s: string) => s.trim()); }
    }
    if (Array.isArray(data.hobbies)) {
      data.hobbies = data.hobbies.filter((id: string) => id && mongoose.Types.ObjectId.isValid(id));
    }

    if (typeof data.location === 'string') {
      try { data.location = JSON.parse(data.location); } catch (e) { }
    }
    if (typeof data.notificationPreferences === 'string') {
      try { data.notificationPreferences = JSON.parse(data.notificationPreferences); } catch (e) { }
    }
    if (typeof data.privacySettings === 'string') {
      try { data.privacySettings = JSON.parse(data.privacySettings); } catch (e) { }
    }

    const existingUser = await User.findById(userId);
    if (!existingUser) throw new Error('USER_NOT_FOUND');

    // Enforce "My Call Price" & "Go Live" call permissions for Female Hosts only
    if (
      'enableVoiceCall' in data ||
      'enableVideoCall' in data ||
      'voiceCallPrice' in data ||
      'videoCallPrice' in data
    ) {
      const userGender = data.gender || existingUser.gender;
      if (userGender !== 'Female') {
        throw new Error('Call pricing and hosting features are available for Female hosts only.');
      }
    }

    if (typeof data.enableVoiceCall === 'string') {
      data.enableVoiceCall = data.enableVoiceCall === 'true';
    }
    if (typeof data.enableVideoCall === 'string') {
      data.enableVideoCall = data.enableVideoCall === 'true';
    }
    if (typeof data.voiceCallPrice === 'string') {
      data.voiceCallPrice = Number(data.voiceCallPrice);
    }
    if (typeof data.videoCallPrice === 'string') {
      data.videoCallPrice = Number(data.videoCallPrice);
    }

    // Support nested updates for preferences if provided in profile update
    if (data.notificationPreferences) {
      const user = await User.findById(userId);
      data.notificationPreferences = { ...user?.notificationPreferences, ...data.notificationPreferences };
    }
    if (data.privacySettings) {
      const user = await User.findById(userId);
      data.privacySettings = { ...user?.privacySettings, ...data.privacySettings };
    }

    // Map career to careerId if provided, handling empty values and casting safely
    if ('career' in data) {
      if (data.career === '' || data.career === null || data.career === undefined) {
        data.careerId = null;
      } else if (mongoose.Types.ObjectId.isValid(data.career)) {
        data.careerId = new mongoose.Types.ObjectId(data.career);
      } else {
        data.careerId = null;
      }
      delete data.career;
    }

    // Validate careerId directly if provided
    if ('careerId' in data) {
      if (data.careerId === '' || data.careerId === null || data.careerId === undefined) {
        data.careerId = null;
      } else if (mongoose.Types.ObjectId.isValid(data.careerId)) {
        data.careerId = new mongoose.Types.ObjectId(data.careerId);
      } else {
        data.careerId = null;
      }
    }

    const updatedUser = await User.findByIdAndUpdate(userId, data, { new: true })
      .populate('profileImage')
      .populate('album')
      .populate({
        path: 'hobbies',
        populate: { path: 'image' }
      })
      .populate({
        path: 'careerId',
        populate: { path: 'image' }
      })
      .populate([...ACTIVE_STORE_POPULATE] as any);

    if (!updatedUser) {
      throw new Error('USER_NOT_FOUND');
    }

    const followersCount = await Follow.countDocuments({ followingId: userId, status: 'accepted' });
    const followingCount = await Follow.countDocuments({ followerId: userId, status: 'accepted' });
    const myFollowing = await Follow.find({ followerId: userId, status: 'accepted' }).select('followingId');
    const myFollowingIds = myFollowing.map(f => f.followingId);
    const friendsCount = await Follow.countDocuments({
      followingId: userId,
      followerId: { $in: myFollowingIds },
      status: 'accepted'
    });

    const visitorsCount = await UserVisitor.distinct('visitorId', { userId }).then(ids => ids.length);

    const richCoins = updatedUser.wealthCoins !== undefined ? updatedUser.wealthCoins : (updatedUser.coins || 0);
    const charmCoins = updatedUser.charmCoins || 0;
    const richLevelInfo = await this.levelService.getLevelInfoForCoins(richCoins, 'rich');
    const charmLevelInfo = await this.levelService.getLevelInfoForCoins(charmCoins, 'charm');

    const ownedAgency = await Agency.findOne({ creatorId: userId })
      .populate('countryId')
      .populate({ path: 'creatorId', select: 'name profileImage userId', populate: { path: 'profileImage' } });

    let agency: any = ownedAgency || null;
    let isAgencyHost = !!ownedAgency;
    let isBecomeHost = false;
    let becomeHostMessage: string | null = null;

    if (!ownedAgency) {
      const agencyHost = await AgencyHost.findOne({ userId, status: 'ACCEPTED' });
      if (agencyHost) {
        const joinedAgency = await Agency.findById(agencyHost.agencyId).select('name');
        isBecomeHost = true;
        becomeHostMessage = joinedAgency
          ? `You are a host under ${joinedAgency.name}.`
          : 'You have joined as an agency host.';
      }
    }

    const profileData = applyProfileDefaults(updatedUser);
    const { referralCode } = await ensureUserReferralCode(updatedUser);
    const deepLink = await getReferralDeepLink(referralCode);

    const AppSetting = mongoose.model('AppSetting');
    const rewardSetting = await AppSetting.findOne({ key: 'invite_reward_coins' });
    const inviteRewardCoins = rewardSetting ? Number(rewardSetting.value) : 2000;

    return {
      profile: {
        ...profileData,
        referralCode,
        referCode: referralCode,
        deepLink,
        inviteRewardCoins,
        career: updatedUser.careerId,
        followersCount,
        followingCount,
        friendsCount,
        visitorsCount,
        levelInfo: richLevelInfo,
        richLevelInfo,
        charmLevelInfo,
        agency,
        isAgencyHost,
        isBecomeHost,
        becomeHostMessage,
      },
      message: 'PROFILE_UPDATED'
    };
  }

  public async updatePreferences(userId: string, data: { notificationPreferences?: any; privacySettings?: any }) {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');

    if (data.notificationPreferences) {
      user.notificationPreferences = { ...user.notificationPreferences, ...data.notificationPreferences };
    }
    if (data.privacySettings) {
      user.privacySettings = { ...user.privacySettings, ...data.privacySettings };
    }

    await user.save();
    return user;
  }

  public async getProfileSettings() {
    const [careers, settings, hobbies] = await Promise.all([
      Career.find({ isActive: true }).populate('image'),
      require('../../models/AppSetting').default.find({
        key: { $in: ['marital_statuses'] }
      }),
      Hobby.find({ isActive: true }).populate('image').sort({ type: 1, name: 1 })
    ]);

    const maritalStatuses = settings.find((s: any) => s.key === 'marital_statuses')?.value || [
      'single', 'divorced', 'married', 'secret', 'inlove'
    ];

    return {
      careers,
      maritalStatuses,
      hobbies
    };
  }

  public async addAlbumPhotos(userId: string, files: Express.Multer.File[]) {
    const uploadResults = await this.cloudinaryService.uploadMedia(MediaType.image, files, 'albums');
    const mediaIds = [];

    for (const result of uploadResults) {
      const media = await this.mediaService.createMedia({
        ...result
      });
      mediaIds.push(media._id);
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $push: { album: { $each: mediaIds } } },
      { new: true }
    )
      .populate('profileImage')
      .populate('album')
      .populate({
        path: 'hobbies',
        populate: { path: 'image' }
      })
      .populate({
        path: 'careerId',
        populate: { path: 'image' }
      });

    if (!updatedUser) throw new Error('USER_NOT_FOUND');

    return updatedUser;
  }

  public async deleteAlbumPhoto(userId: string, photoId: string) {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $pull: { album: photoId } },
      { new: true }
    )
      .populate('profileImage')
      .populate('album')
      .populate({
        path: 'hobbies',
        populate: { path: 'image' }
      })
      .populate({
        path: 'careerId',
        populate: { path: 'image' }
      });

    if (!updatedUser) throw new Error('USER_NOT_FOUND');

    return updatedUser;
  }

  public async uploadVideoVerification(userId: string, file: Express.Multer.File) {
    const uploadResults = await this.cloudinaryService.uploadMedia(MediaType.video, [file], 'verifications');
    if (!uploadResults || uploadResults.length === 0) {
      throw new Error('Video upload failed');
    }

    const media = await this.mediaService.createMedia({
      ...uploadResults[0]
    });

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        videoVerificationVideo: media._id,
        videoVerificationStatus: 'pending'
      },
      { new: true }
    );

    if (!updatedUser) throw new Error('USER_NOT_FOUND');

    return {
      message: 'Video verification uploaded successfully',
      status: updatedUser.videoVerificationStatus
    };
  }

  public async getReferralInfo(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const { referralCode } = await ensureUserReferralCode(user);
    const deepLink = await getReferralDeepLink(referralCode);

    const AppSetting = mongoose.model('AppSetting');
    const rewardSetting = await AppSetting.findOne({ key: 'invite_reward_coins' });
    const inviteRewardCoins = rewardSetting ? Number(rewardSetting.value) : 2000;

    const referralHistories = await CoinHistory.find({
      userId: new mongoose.Types.ObjectId(userId),
      type: 'referral_reward'
    }).populate({
      path: 'relatedUserId',
      select: 'name profileImage userId createdAt',
      populate: { path: 'profileImage' }
    }).sort({ createdAt: -1 });

    const totalInvites = referralHistories.length;
    const totalEarnedCoins = referralHistories.reduce((sum, item) => sum + (item.amount || 0), 0);

    return {
      referralCode,
      referCode: referralCode,
      deepLink,
      inviteRewardCoins,
      totalInvites,
      totalEarnedCoins,
      invitedUsers: referralHistories.map(h => ({
        user: h.relatedUserId,
        earnedCoins: h.amount,
        createdAt: h.createdAt
      }))
    };
  }
}
