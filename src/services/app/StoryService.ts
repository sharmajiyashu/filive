import { Service } from 'typedi';
import Story from '../../models/Story';
import Comment from '../../models/Comment';
import Like from '../../models/Like';
import User from '../../models/User';
import mongoose from 'mongoose';
import { CloudinaryService } from '../common/CloudinaryService';
import { MediaService } from '../common/MediaService';
import { MediaType } from '../../constants/enum';

@Service()
export class StoryService {
  constructor(
    private cloudinaryService: CloudinaryService,
    private mediaService: MediaService
  ) { }

  public async createStory(userId: string, data: { content: string; tags?: any }, files?: Express.Multer.File[]) {
    const mediaIds: mongoose.Types.ObjectId[] = [];

    if (files && files.length > 0) {
      const uploadResults = await this.cloudinaryService.uploadMedia(MediaType.image, files, 'stories');
      for (const result of uploadResults) {
        const media = await this.mediaService.createMedia(result);
        mediaIds.push(media._id as mongoose.Types.ObjectId);
      }
    }

    const story = await Story.create({
      userId,
      content: data.content,
      images: mediaIds,
      tags: typeof data.tags === 'string' ? (data.tags.startsWith('[') ? JSON.parse(data.tags) : [data.tags]) : (Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : [])),
    });
    return story;
  }

  public async getExploreStories(page: number = 1, limit: number = 10) {
    const stories = await Story.find()
      .populate('userId', 'name email profileImage')
      .populate('images')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Story.countDocuments();

    return {
      stories,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public async likeStory(userId: string, storyId: string) {
    const existingLike = await Like.findOne({ userId, targetId: storyId, targetType: 'Story' });

    if (existingLike) {
      await Like.deleteOne({ _id: existingLike._id });
      await Story.findByIdAndUpdate(storyId, { $inc: { likesCount: -1 } });
      return { liked: false };
    }

    await Like.create({ userId, targetId: storyId, targetType: 'Story' });
    await Story.findByIdAndUpdate(storyId, { $inc: { likesCount: 1 } });
    return { liked: true };
  }

  public async commentOnStory(userId: string, storyId: string, content: string) {
    const comment = await Comment.create({
      userId,
      storyId,
      content,
    });
    await Story.findByIdAndUpdate(storyId, { $inc: { commentsCount: 1 } });
    return comment;
  }

  public async getStoryComments(storyId: string, page: number = 1, limit: number = 10) {
    const comments = await Comment.find({ storyId })
      .populate('userId', 'name email profileImage')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Comment.countDocuments({ storyId });

    return {
      comments,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public async likeComment(userId: string, commentId: string) {
    const existingLike = await Like.findOne({ userId, targetId: commentId, targetType: 'Comment' });

    if (existingLike) {
      await Like.deleteOne({ _id: existingLike._id });
      await Comment.findByIdAndUpdate(commentId, { $inc: { likesCount: -1 } });
      return { liked: false };
    }

    await Like.create({ userId, targetId: commentId, targetType: 'Comment' });
    await Comment.findByIdAndUpdate(commentId, { $inc: { likesCount: 1 } });
    return { liked: true };
  }
}
