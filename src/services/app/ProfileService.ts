import FriendRequest from '../../models/FriendRequest';
import { Service, Container } from 'typedi';
import mongoose from 'mongoose';
import User from '../../models/User';
import Follow from '../../models/Follow';
import { CloudinaryService } from '../common/CloudinaryService';
import { MediaService } from '../common/MediaService';
import { MediaType } from '../../constants/enum';
import { ReportService } from './ReportService';
import Career from '../../models/Career';
import Hobby from '../../models/Hobby';
import Country from '../../models/Country';
import { LevelService } from './LevelService';
import UserVisitor from '../../models/UserVisitor';
import AgencyHost from '../../models/AgencyHost';
import Agency from '../../models/Agency';
import CoinHistory from '../../models/CoinHistory';
import FamilyMember from '../../models/FamilyMember';
import Family from '../../models/Family';
import Room from '../../models/Room';
import { applyProfileDefaultsWithAlbum, withDefaultAlbum } from './profileDefaults';
import { ensureUserReferralCode, getReferralDeepLink } from '../../utils/referral';
import { ACTIVE_STORE_POPULATE, formatUserActiveStoreItems } from '../../utils/activeStorePopulate';
import { resolveCountryFromSignals } from '../../utils/phoneCountry';
import { attachUserCountryAndAge } from '../../utils/userLookup';

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
      .populate('countryId')
      .populate([...ACTIVE_STORE_POPULATE] as any);
    if (!profile) {
      throw new Error('USER_NOT_FOUND');
    }

    const formattedProfile = await formatUserActiveStoreItems(profile, true);

    const followersCount = await Follow.countDocuments({ followingId: userId, status: { $ne: 'rejected' } });
    const followingCount = await Follow.countDocuments({ followerId: userId, status: { $ne: 'rejected' } });
    const myFollowing = await Follow.find({ followerId: userId, status: { $ne: 'rejected' } }).select('followingId');
    const myFollowingIds = myFollowing.map(f => f.followingId);
    const mutualFriendsCount = await Follow.countDocuments({
      followingId: userId,
      followerId: { $in: myFollowingIds },
      status: { $ne: 'rejected' }
    });
    const acceptedRequestsCount = await FriendRequest.countDocuments({
      $or: [
        { senderId: userId, status: 'accepted' },
        { receiverId: userId, status: 'accepted' }
      ]
    });
    const friendsCount = Math.max(mutualFriendsCount, acceptedRequestsCount);

    const visitorsCount = await UserVisitor.distinct('visitorId', { userId }).then(ids => ids.length);

    const richCoins = profile.wealthCoins !== undefined ? profile.wealthCoins : (profile.coins || 0);
    const charmCoins = profile.charmCoins || 0;
    const richLevelInfo = await this.levelService.getLevelInfoForCoins(richCoins, 'rich');
    const charmLevelInfo = await this.levelService.getLevelInfoForCoins(charmCoins, 'charm');

    const ownedAgency = await Agency.findOne({
      creatorId: userId,
      isVerified: true,
      status: { $in: ['approved', 'pending'] }
    })
      .populate('countryId')
      .populate({ path: 'creatorId', select: 'name profileImage userId', populate: { path: 'profileImage' } });

    const agency: any = ownedAgency || null;
    let isAgencyHost = false;
    let isBecomeHost = false;
    let becomeHostMessage: string | null = null;
    let joinedAgency: any = null;

    const agencyHost = await AgencyHost.findOne({ userId, status: { $in: ['ACCEPTED', 'approved'] } });
    if (agencyHost) {
      isAgencyHost = true;
      isBecomeHost = true;
      const hostAgency = await Agency.findById(agencyHost.agencyId)
        .populate('countryId')
        .populate({ path: 'creatorId', select: 'name profileImage userId', populate: { path: 'profileImage' } });
      if (hostAgency) {
        joinedAgency = hostAgency;
        becomeHostMessage = `You are a host under ${hostAgency.name}.`;
      }
    }

    const profileData = await attachUserCountryAndAge(await applyProfileDefaultsWithAlbum(formattedProfile || profile));
    const { referralCode } = await ensureUserReferralCode(profile);
    const deepLink = await getReferralDeepLink(referralCode);

    const AppSetting = mongoose.model('AppSetting');
    const rewardSetting = await AppSetting.findOne({ key: 'invite_reward_coins' });
    const inviteRewardCoins = rewardSetting ? Number(rewardSetting.value) : 2000;

    let familyMemberDoc: any = await FamilyMember.findOne({ userId })
      .populate({
        path: 'familyId',
        populate: [
          { path: 'creatorId', select: 'name email profileImage userId' },
          { path: 'image' }
        ]
      });

    let family: any = familyMemberDoc && familyMemberDoc.familyId ? familyMemberDoc.familyId : null;
    let familyRole: any = familyMemberDoc ? familyMemberDoc.role : null;

    if (!family) {
      const createdFamily = await Family.findOne({ creatorId: userId })
        .populate({ path: 'creatorId', select: 'name email profileImage userId' })
        .populate('image');
      if (createdFamily) {
        family = createdFamily;
        familyRole = 'creator';
      }
    }

    const richLevelNum = typeof richLevelInfo?.currentLevel?.levelNumber === 'number' ? richLevelInfo.currentLevel.levelNumber : 0;
    const charmLevelNum = typeof charmLevelInfo?.currentLevel?.levelNumber === 'number' ? charmLevelInfo.currentLevel.levelNumber : 0;

    const userObjId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null;
    const activeLive = userObjId
      ? await Room.findOne({ hostId: userObjId, status: 'live', roomType: 'livestream' }).populate('roomPhoto')
      : null;

    const { LiveStreamService } = await import('./LiveStreamService');
    const liveStreamService = Container.get(LiveStreamService);
    const activeParty = await liveStreamService.getActiveRoomForHost(userId, 'party_room');
    if (activeParty) {
      activeParty.isMine = true;
    }

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
      level: richLevelNum,
      levelNumber: richLevelNum,
      wealthLevel: richLevelNum,
      charmLevel: charmLevelNum,
      levelInfo: richLevelInfo,
      richLevelInfo,
      charmLevelInfo,
      agency,
      joinedAgency,
      isAgencyHost,
      isBecomeHost,
      becomeHostMessage,
      family,
      familyRole,
      isLive: !!activeLive,
      liveStream: activeLive ? (typeof (activeLive as any).toObject === 'function' ? (activeLive as any).toObject() : activeLive) : null,
      partyRoom: activeParty,
      activePartyRoom: activeParty,
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

    const isChangingCallSettings = data.voiceCallPrice !== undefined ||
      data.videoCallPrice !== undefined ||
      data.audioCallChargePerMinute !== undefined ||
      data.videoCallChargePerMinute !== undefined ||
      data.enableVoiceCall !== undefined ||
      data.enableVideoCall !== undefined;

    if (isChangingCallSettings && existingUser.videoVerificationStatus !== 'approved') {
      throw new Error('Face verification is required before you can change voice/video call price or call settings. Please complete face verification first.');
    }

    if (data.enableVoiceCall !== undefined) {
      data.enableVoiceCall = data.enableVoiceCall === true || data.enableVoiceCall === 'true';
    }
    if (data.enableVideoCall !== undefined) {
      data.enableVideoCall = data.enableVideoCall === true || data.enableVideoCall === 'true';
    }
    if (data.voiceCallPrice !== undefined) {
      data.voiceCallPrice = Number(data.voiceCallPrice);
      data.audioCallChargePerMinute = data.voiceCallPrice;
    }
    if (data.videoCallPrice !== undefined) {
      data.videoCallPrice = Number(data.videoCallPrice);
      data.videoCallChargePerMinute = data.videoCallPrice;
    }

    // Support nested updates for preferences if provided in profile update
    if (data.notificationPreferences) {
      const user = await User.findById(userId);
      data.notificationPreferences = { ...user?.notificationPreferences, ...data.notificationPreferences };
    }
    if (data.privacySettings) {
      const user = await User.findById(userId);
      const isVip = Boolean(user?.isVip || user?.isPremium);
      if (!isVip) {
        throw new Error('Privacy settings are an exclusive VIP feature. Please upgrade to VIP.');
      }
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

    if (data.countryId || data.countryCode || data.country) {
      const resolved = await resolveCountryFromSignals({
        countryId: data.countryId,
        countryCode: data.countryCode || data.country,
      });
      if (resolved?.countryId) {
        data.countryId = resolved.countryId;
        data.country = resolved.country;
        data.countryCode = resolved.country;
      } else {
        if (data.countryCode) data.countryCode = String(data.countryCode).trim().toUpperCase();
        if (data.country) data.country = String(data.country).trim();
      }
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
      .populate('countryId')
      .populate([...ACTIVE_STORE_POPULATE] as any);

    if (!updatedUser) {
      throw new Error('USER_NOT_FOUND');
    }

    const formattedUpdatedUser = await formatUserActiveStoreItems(updatedUser, true);

    const followersCount = await Follow.countDocuments({ followingId: userId, status: { $ne: 'rejected' } });
    const followingCount = await Follow.countDocuments({ followerId: userId, status: { $ne: 'rejected' } });
    const myFollowing = await Follow.find({ followerId: userId, status: { $ne: 'rejected' } }).select('followingId');
    const myFollowingIds = myFollowing.map(f => f.followingId);
    const mutualFriendsCount = await Follow.countDocuments({
      followingId: userId,
      followerId: { $in: myFollowingIds },
      status: { $ne: 'rejected' }
    });
    const acceptedRequestsCount = await FriendRequest.countDocuments({
      $or: [
        { senderId: userId, status: 'accepted' },
        { receiverId: userId, status: 'accepted' }
      ]
    });
    const friendsCount = Math.max(mutualFriendsCount, acceptedRequestsCount);

    const visitorsCount = await UserVisitor.distinct('visitorId', { userId }).then(ids => ids.length);

    const richCoins = updatedUser.wealthCoins !== undefined ? updatedUser.wealthCoins : (updatedUser.coins || 0);
    const charmCoins = updatedUser.charmCoins || 0;
    const richLevelInfo = await this.levelService.getLevelInfoForCoins(richCoins, 'rich');
    const charmLevelInfo = await this.levelService.getLevelInfoForCoins(charmCoins, 'charm');
    const richLevelNum = typeof richLevelInfo?.currentLevel?.levelNumber === 'number' ? richLevelInfo.currentLevel.levelNumber : 0;
    const charmLevelNum = typeof charmLevelInfo?.currentLevel?.levelNumber === 'number' ? charmLevelInfo.currentLevel.levelNumber : 0;

    const ownedAgency = await Agency.findOne({
      creatorId: userId,
      isVerified: true,
      status: { $in: ['approved', 'pending'] }
    })
      .populate('countryId')
      .populate({ path: 'creatorId', select: 'name profileImage userId', populate: { path: 'profileImage' } });

    const agency: any = ownedAgency || null;
    let isAgencyHost = false;
    let isBecomeHost = false;
    let becomeHostMessage: string | null = null;
    let joinedAgency: any = null;

    const agencyHost = await AgencyHost.findOne({ userId, status: { $in: ['ACCEPTED', 'approved'] } });
    if (agencyHost) {
      isAgencyHost = true;
      isBecomeHost = true;
      const hostAgency = await Agency.findById(agencyHost.agencyId)
        .populate('countryId')
        .populate({ path: 'creatorId', select: 'name profileImage userId', populate: { path: 'profileImage' } });
      if (hostAgency) {
        joinedAgency = hostAgency;
        becomeHostMessage = `You are a host under ${hostAgency.name}.`;
      }
    }

    const profileData = await attachUserCountryAndAge(await applyProfileDefaultsWithAlbum(formattedUpdatedUser || updatedUser));
    const { referralCode } = await ensureUserReferralCode(updatedUser);
    const deepLink = await getReferralDeepLink(referralCode);

    const AppSetting = mongoose.model('AppSetting');
    const rewardSetting = await AppSetting.findOne({ key: 'invite_reward_coins' });
    const inviteRewardCoins = rewardSetting ? Number(rewardSetting.value) : 2000;

    return {
      profile: {
        ...profileData,
        career: updatedUser.careerId || updatedUser.career,
        referralCode,
        referCode: referralCode,
        deepLink,
        inviteRewardCoins,
        voiceCallPrice: Number(updatedUser.voiceCallPrice ?? updatedUser.audioCallChargePerMinute ?? 0),
        videoCallPrice: Number(updatedUser.videoCallPrice ?? updatedUser.videoCallChargePerMinute ?? 0),
        audioCallPrice: Number(updatedUser.voiceCallPrice ?? updatedUser.audioCallChargePerMinute ?? 0),
        audioCallChargePerMinute: Number(updatedUser.voiceCallPrice ?? updatedUser.audioCallChargePerMinute ?? 0),
        videoCallChargePerMinute: Number(updatedUser.videoCallPrice ?? updatedUser.videoCallChargePerMinute ?? 0),
        enableVoiceCall: updatedUser.enableVoiceCall ?? true,
        enableVideoCall: updatedUser.enableVideoCall ?? true,
        followersCount,
        followingCount,
        friendsCount,
        visitorsCount,
        level: richLevelNum,
        levelNumber: richLevelNum,
        wealthLevel: richLevelNum,
        charmLevel: charmLevelNum,
        levelInfo: richLevelInfo,
        richLevelInfo,
        charmLevelInfo,
        agency,
        joinedAgency,
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
      const isVip = Boolean(user.isVip || user.isPremium);
      if (!isVip) {
        throw new Error('Privacy settings are an exclusive VIP feature. Please upgrade to VIP.');
      }
      user.privacySettings = { ...user.privacySettings, ...data.privacySettings };
    }

    await user.save();
    return user;
  }

  public async getProfileSettings() {
    const [careers, settings, hobbies, countries] = await Promise.all([
      Career.find({ isActive: true }).populate('image').sort({ name: 1 }),
      require('../../models/AppSetting').default.find({
        key: { $in: ['marital_statuses', 'height_options', 'weight_options'] }
      }),
      Hobby.find({ isActive: true }).populate('image').sort({ type: 1, name: 1 }),
      Country.find({ isActive: true }).sort({ name: 1 })
    ]);

    const maritalStatuses = settings.find((s: any) => s.key === 'marital_statuses')?.value || [
      'Single', 'In Love', 'Engaged', 'Married', 'Separated', 'Divorced', 'Widowed', 'Secret', 'Complicated'
    ];

    const heightOptions = settings.find((s: any) => s.key === 'height_options')?.value || [];
    const weightOptions = settings.find((s: any) => s.key === 'weight_options')?.value || [];

    return {
      careers,
      maritalStatuses,
      hobbies,
      heightOptions,
      weightOptions,
      countries
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

    await User.findByIdAndUpdate(
      userId,
      { $push: { album: { $each: mediaIds } } },
      { new: true }
    );

    const profile = await this.getProfile(userId);
    return {
      profile,
      user: profile,
      album: profile.album,
      message: 'ALBUM_UPDATED'
    };
  }

  public async deleteAlbumPhoto(userId: string, photoId: string) {
    await User.findByIdAndUpdate(
      userId,
      { $pull: { album: photoId } },
      { new: true }
    );

    const profile = await this.getProfile(userId);
    return {
      profile,
      user: profile,
      album: profile.album,
      message: 'ALBUM_UPDATED'
    };
  }

  public async uploadVideoVerification(
    userId: string,
    filesInput: any,
    opts: { duration?: number } = {}
  ) {
    let videoFile: Express.Multer.File | undefined;
    let photoIdFile: Express.Multer.File | undefined;

    if (Array.isArray(filesInput)) {
      for (const f of filesInput) {
        const fname = (f.fieldname || '').toLowerCase();
        const mime = (f.mimetype || '').toLowerCase();
        if (fname === 'video' || mime.startsWith('video/')) {
          videoFile = f;
        } else if (
          fname.includes('id') ||
          fname.includes('photo') ||
          fname.includes('doc') ||
          mime.startsWith('image/')
        ) {
          photoIdFile = f;
        }
      }
      if (!videoFile && filesInput.length > 0) {
        // If only 1 file and it's video or generic
        if (filesInput[0].mimetype?.startsWith('video/')) {
          videoFile = filesInput[0];
        } else if (!photoIdFile) {
          photoIdFile = filesInput[0];
        }
      }
      if (!photoIdFile && filesInput.length > 1 && !videoFile) {
        photoIdFile = filesInput[0];
        videoFile = filesInput[1];
      }
    } else if (filesInput && filesInput.fieldname) {
      const single = filesInput as Express.Multer.File;
      if (single.mimetype.startsWith('video/')) {
        videoFile = single;
      } else {
        photoIdFile = single;
      }
    }

    if (!videoFile && filesInput) {
      if (Array.isArray(filesInput) && filesInput.length > 0) {
        videoFile = filesInput[0];
      } else if (filesInput.buffer || filesInput.path) {
        videoFile = filesInput;
      }
    }

    if (!videoFile) {
      throw new Error('Please record and upload your 10-second face verification video');
    }

    const updateData: any = {
      videoVerificationStatus: 'pending',
      verificationSubmittedAt: new Date(),
      verificationRejectReason: undefined,
      verificationVideoDuration: opts.duration || 10,
    };

    if (videoFile) {
      const uploadResults = await this.cloudinaryService.uploadMedia(MediaType.video, [videoFile], 'verifications');
      if (uploadResults && uploadResults.length > 0) {
        const media = await this.mediaService.createMedia({
          ...uploadResults[0],
        });
        updateData.videoVerificationVideo = media._id;
      }
    }

    if (photoIdFile) {
      const uploadResults = await this.cloudinaryService.uploadMedia(MediaType.image, [photoIdFile], 'verification_ids');
      if (uploadResults && uploadResults.length > 0) {
        const media = await this.mediaService.createMedia({
          ...uploadResults[0],
        });
        updateData.verificationDocumentPhoto = media._id;
      }
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true })
      .populate('videoVerificationVideo')
      .populate('verificationDocumentPhoto');

    if (!updatedUser) throw new Error('USER_NOT_FOUND');

    try {
      const reportService = Container.get(ReportService);
      await reportService.sendOfficialSystemMessage(
        userId,
        'Verification Submitted',
        'Your 10-second face verification video has been received and is pending administrative review. Thank you for keeping Filive safe.',
        { type: 'verification_submitted', status: 'pending' }
      );
    } catch {
      // non-blocking
    }

    return {
      message: 'Video verification uploaded successfully',
      status: updatedUser.videoVerificationStatus,
      user: updatedUser,
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
