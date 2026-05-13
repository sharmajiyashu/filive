import { Service } from 'typedi';
import User from '../../models/User';
import Follow from '../../models/Follow';
import { CloudinaryService } from '../common/CloudinaryService';
import { MediaService } from '../common/MediaService';
import { MediaType } from '../../constants/enum';

@Service()
export class ProfileService {
  constructor(
    private cloudinaryService: CloudinaryService,
    private mediaService: MediaService
  ) { }

  public async getProfile(userId: string) {
    const profile = await User.findById(userId).populate('profileImage');
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

    return {
      ...profile.toObject(),
      followersCount,
      followingCount,
      friendsCount
    };
  }

  public async updateProfile(userId: string, data: any, file?: Express.Multer.File) {
    if (file) {
      const uploadResults = await this.cloudinaryService.uploadMedia(MediaType.image, [file], 'profiles');
      if (uploadResults.length > 0) {
        const media = await this.mediaService.createMedia({
          ...uploadResults[0]
        });
        data.profileImage = media._id;
      }
    }

    if (data.dob) {
      data.dob = new Date(data.dob);
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

    const updatedUser = await User.findByIdAndUpdate(userId, data, { new: true }).populate('profileImage');

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

    return {
      profile: {
        ...updatedUser.toObject(),
        followersCount,
        followingCount,
        friendsCount
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
    const settings = await require('../../models/AppSetting').default.find({
      key: { $in: ['careers', 'marital_statuses'] }
    });

    const careers = settings.find((s: any) => s.key === 'careers')?.value || [];
    const maritalStatuses = settings.find((s: any) => s.key === 'marital_statuses')?.value || [
      'single', 'divorced', 'married', 'secret', 'inlove'
    ];

    return {
      careers,
      maritalStatuses
    };
  }
}
