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

    // Parse hashtags and mentions from content if not provided
    const hashtags = data.content.match(/#[a-z0-9_]+/gi)?.map(tag => tag.slice(1)) || [];
    const mentionNames = data.content.match(/@[a-z0-9_]+/gi)?.map(name => name.slice(1)) || [];

    // Find user IDs for mentions
    const mentions: mongoose.Types.ObjectId[] = [];
    if (mentionNames.length > 0) {
      const mentionedUsers = await User.find({ name: { $in: mentionNames } }).select('_id');
      mentionedUsers.forEach(user => mentions.push(user._id as mongoose.Types.ObjectId));
    }

    const providedTags = typeof data.tags === 'string' ? (data.tags.startsWith('[') ? JSON.parse(data.tags) : [data.tags]) : (Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []));
    const allTags = [...new Set([...hashtags, ...providedTags])];

    const story = await Story.create({
      userId,
      content: data.content,
      images: mediaIds,
      tags: allTags,
      mentions: mentions,
    });
    return story;
  }

  public async getExploreStories(currentUserId?: string, page: number = 1, limit: number = 10) {
    const stories = await Story.find()
      .populate('userId', 'name email profileImage')
      .populate('images')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Story.countDocuments();

    let storiesWithLikeStatus = stories;
    if (currentUserId) {
      const storyIds = stories.map(s => s._id);
      const likes = await Like.find({
        userId: currentUserId,
        targetId: { $in: storyIds },
        targetType: 'Story'
      });
      const likedStoryIds = new Set(likes.map(l => l.targetId.toString()));

      storiesWithLikeStatus = stories.map(story => {
        const storyObj = story.toObject();
        return {
          ...storyObj,
          isLiked: likedStoryIds.has(story._id.toString())
        };
      }) as any;
    }

    return {
      stories: storiesWithLikeStatus,
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

  public async getStoryComments(storyId: string, currentUserId?: string, page: number = 1, limit: number = 10) {
    const comments = await Comment.find({ storyId })
      .populate('userId', 'name email profileImage')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Comment.countDocuments({ storyId });

    let commentsWithLikeStatus = comments;
    if (currentUserId) {
      const commentIds = comments.map(c => c._id);
      const likes = await Like.find({
        userId: currentUserId,
        targetId: { $in: commentIds },
        targetType: 'Comment'
      });
      const likedCommentIds = new Set(likes.map(l => l.targetId.toString()));

      commentsWithLikeStatus = comments.map(comment => {
        const commentObj = comment.toObject();
        return {
          ...commentObj,
          isLiked: likedCommentIds.has(comment._id.toString())
        };
      }) as any;
    }

    return {
      comments: commentsWithLikeStatus,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public async likeComment(userId: string, commentId: string) {
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      throw new Error('Invalid comment ID');
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }

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
