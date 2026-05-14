import { Service } from 'typedi';
import User from '../../models/User';
import Follow from '../../models/Follow';
import { CloudinaryService } from '../common/CloudinaryService';
import { MediaService } from '../common/MediaService';
import { MediaType } from '../../constants/enum';
import Career from '../../models/Career';

@Service()
export class ProfileService {
  constructor(
    private cloudinaryService: CloudinaryService,
    private mediaService: MediaService
  ) { }

  public async getProfile(userId: string) {
    const profile = await User.findById(userId)
      .populate('profileImage')
      .populate('album')
      .populate({
        path: 'careerId',
        populate: { path: 'image' }
      });
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
      data.dob = new Date(data.dob);
    }

    // Parse JSON strings for multipart/form-data
    if (typeof data.hobbies === 'string') {
      try { data.hobbies = JSON.parse(data.hobbies); } catch (e) { data.hobbies = data.hobbies.split(',').map((s: string) => s.trim()); }
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

    // Support nested updates for preferences if provided in profile update
    if (data.notificationPreferences) {
      const user = await User.findById(userId);
      data.notificationPreferences = { ...user?.notificationPreferences, ...data.notificationPreferences };
    }
    if (data.privacySettings) {
      const user = await User.findById(userId);
      data.privacySettings = { ...user?.privacySettings, ...data.privacySettings };
    }

    const updatedUser = await User.findByIdAndUpdate(userId, data, { new: true })
      .populate('profileImage')
      .populate('album')
      .populate({
        path: 'careerId',
        populate: { path: 'image' }
      });

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
    const [careers, settings] = await Promise.all([
      Career.find({ isActive: true }).populate('image'),
      require('../../models/AppSetting').default.find({
        key: { $in: ['marital_statuses'] }
      })
    ]);

    const maritalStatuses = settings.find((s: any) => s.key === 'marital_statuses')?.value || [
      'single', 'divorced', 'married', 'secret', 'inlove'
    ];

    return {
      careers,
      maritalStatuses
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
    ).populate('profileImage').populate('album').populate({
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
    ).populate('profileImage').populate('album').populate({
      path: 'careerId',
      populate: { path: 'image' }
    });

    if (!updatedUser) throw new Error('USER_NOT_FOUND');

    return updatedUser;
  }
}
