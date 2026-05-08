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
  ) {}

  public async getProfile(userId: string) {
    const profile = await User.findById(userId).populate('profileImage');
    if (!profile) {
      throw new Error('USER_NOT_FOUND');
    }
    
    const followersCount = await Follow.countDocuments({ followingId: userId, status: 'accepted' });
    const followingCount = await Follow.countDocuments({ followerId: userId, status: 'accepted' });

    return {
        ...profile.toObject(),
        followersCount,
        followingCount
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

    const updatedUser = await User.findByIdAndUpdate(userId, data, { new: true }).populate('profileImage');
    
    if (!updatedUser) {
      throw new Error('USER_NOT_FOUND');
    }

    const followersCount = await Follow.countDocuments({ followingId: userId, status: 'accepted' });
    const followingCount = await Follow.countDocuments({ followerId: userId, status: 'accepted' });

    return {
        profile: {
            ...updatedUser.toObject(),
            followersCount,
            followingCount
        },
        message: 'PROFILE_UPDATED'
    };
  }
}
