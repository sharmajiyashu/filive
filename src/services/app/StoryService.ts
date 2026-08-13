import { Service } from 'typedi';
import Story from '../../models/Story';
import Comment from '../../models/Comment';
import Like from '../../models/Like';
import Follow from '../../models/Follow';
import User from '../../models/User';
import Block from '../../models/Block';
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

  public async createStory(userId: string, data: { content?: string; tags?: any }, files?: Express.Multer.File[]) {
    const mediaIds: mongoose.Types.ObjectId[] = [];

    if (files && files.length > 0) {
      const uploadResults = await this.cloudinaryService.uploadMedia(MediaType.image, files, 'stories');
      for (const result of uploadResults) {
        const media = await this.mediaService.createMedia(result);
        mediaIds.push(media._id as mongoose.Types.ObjectId);
      }
    }

    const contentText = data?.content || '';

    // Parse hashtags and mentions from content if provided
    const hashtags = contentText.match(/#[a-z0-9_]+/gi)?.map(tag => tag.slice(1)) || [];
    const mentionNames = contentText.match(/@[a-z0-9_]+/gi)?.map(name => name.slice(1)) || [];

    // Find user IDs for mentions
    const mentions: mongoose.Types.ObjectId[] = [];
    if (mentionNames.length > 0) {
      const mentionedUsers = await User.find({ name: { $in: mentionNames } }).select('_id');
      mentionedUsers.forEach(user => mentions.push(user._id as mongoose.Types.ObjectId));
    }

    const providedTags = typeof data?.tags === 'string' ? (data.tags.startsWith('[') ? JSON.parse(data.tags) : [data.tags]) : (Array.isArray(data?.tags) ? data.tags : (data?.tags ? [data.tags] : []));
    const allTags = [...new Set([...hashtags, ...providedTags])];

    const story = await Story.create({
      userId,
      content: contentText,
      images: mediaIds,
      tags: allTags,
      mentions: mentions,
    });
    return story;
  }

  public async getExploreStories(currentUserId?: string, page: number = 1, limit: number = 10, filter?: string) {
    let query: any = { isBlocked: { $ne: true } };

    if (currentUserId) {
      const blockedRelations = await Block.find({
        $or: [
          { blockerId: currentUserId },
          { blockedId: currentUserId }
        ]
      });

      const excludedUserIds = blockedRelations.map((rel: any) =>
        rel.blockerId.toString() === currentUserId ? rel.blockedId : rel.blockerId
      );

      if (excludedUserIds.length > 0) {
        query.userId = { $nin: excludedUserIds };
      }
    }

    const filterType = (filter || '').toLowerCase();

    if (filterType === 'following' || filterType === 'follow') {
      if (!currentUserId) {
        return {
          stories: [],
          pagination: { total: 0, page, limit, totalPages: 0 }
        };
      }
      const userFollows = await Follow.find({
        followerId: currentUserId,
        status: 'accepted'
      }).select('followingId');

      const followedUserIds = userFollows.map(f => f.followingId);
      if (followedUserIds.length === 0) {
        return {
          stories: [],
          pagination: { total: 0, page, limit, totalPages: 0 }
        };
      }
      query.userId = query.userId ? { $in: followedUserIds, $nin: query.userId.$nin } : { $in: followedUserIds };
    }

    let sortOption: any = { createdAt: -1 };
    if (filterType === 'popular' || filterType === 'hot') {
      sortOption = { likesCount: -1, commentsCount: -1, createdAt: -1 };
    }

    const stories = await Story.find(query)
      .populate({
        path: 'userId',
        select: 'userId name email profileImage bio isPremium location country isVerified lastLoginAt',
        populate: { path: 'profileImage' }
      })
      .populate('images')
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Story.countDocuments(query);

    let likedStoryIds = new Set<string>();
    let commentedStoryIds = new Set<string>();
    let followingUserIds = new Set<string>();

    if (currentUserId) {
      const storyIds = stories.map(s => s._id);

      const [likes, comments, following] = await Promise.all([
        Like.find({
          userId: currentUserId,
          targetId: { $in: storyIds },
          targetType: 'Story'
        }),
        Comment.find({
          userId: currentUserId,
          storyId: { $in: storyIds }
        }),
        Follow.find({
          followerId: currentUserId,
          followingId: { $in: stories.map(s => s.userId ? ((s.userId as any)._id || s.userId) : null).filter(Boolean) },
          status: 'accepted'
        })
      ]);

      likedStoryIds = new Set(likes.map(l => l.targetId.toString()));
      commentedStoryIds = new Set(comments.map(c => c.storyId.toString()));
      followingUserIds = new Set(following.map(f => f.followingId.toString()));
    }

    const storiesWithStatus = stories.map(story => {
      const storyObj = story.toObject();
      const authorId = story.userId ? ((story.userId as any)._id || story.userId) : null;
      const isFollowing = (currentUserId && authorId) ? followingUserIds.has(authorId.toString()) : false;

      let userObj = storyObj.userId as any;
      if (userObj && typeof userObj === 'object') {
        const isOnline = userObj.lastLoginAt ? new Date(userObj.lastLoginAt).getTime() > Date.now() - 15 * 60 * 1000 : false;
        userObj = {
          ...userObj,
          isOnline,
          status: isOnline ? 'online' : 'offline',
          isFollowing
        };
      }

      return {
        ...storyObj,
        userId: userObj,
        user: userObj,
        isLiked: currentUserId ? likedStoryIds.has(story._id.toString()) : false,
        isCommented: currentUserId ? commentedStoryIds.has(story._id.toString()) : false,
        isFollowing
      };
    });

    return {
      stories: storiesWithStatus,
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
      .populate({
        path: 'userId',
        select: 'userId name email profileImage bio isPremium location country isVerified lastLoginAt',
        populate: { path: 'profileImage' }
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Comment.countDocuments({ storyId });

    let isCommented = false;
    let isStoryLiked = false;
    let followingUserIds = new Set<string>();
    let likedCommentIds = new Set<string>();

    if (currentUserId) {
      const commentIds = comments.map(c => c._id);
      const [userComment, storyLike, following, commentLikes] = await Promise.all([
        Comment.findOne({ userId: currentUserId, storyId }),
        Like.findOne({ userId: currentUserId, targetId: storyId, targetType: 'Story' }),
        Follow.find({
          followerId: currentUserId,
          followingId: { $in: comments.map(c => c.userId?._id?.toString()).filter(Boolean) },
          status: 'accepted'
        }),
        Like.find({
          userId: currentUserId,
          targetId: { $in: commentIds },
          targetType: 'Comment'
        })
      ]);
      isCommented = !!userComment;
      isStoryLiked = !!storyLike;
      followingUserIds = new Set(following.map(f => f.followingId.toString()));
      likedCommentIds = new Set(commentLikes.map(l => l.targetId.toString()));
    }

    const commentsWithFullStatus = comments.map(comment => {
      const commentObj = comment.toObject();
      const authorId = comment.userId?._id?.toString();
      const isFollowing = (currentUserId && authorId) ? followingUserIds.has(authorId) : false;

      let userObj = commentObj.userId as any;
      if (userObj && typeof userObj === 'object') {
        const isOnline = userObj.lastLoginAt ? new Date(userObj.lastLoginAt).getTime() > Date.now() - 15 * 60 * 1000 : false;
        userObj = {
          ...userObj,
          isOnline,
          status: isOnline ? 'online' : 'offline',
          isFollowing
        };
      }

      return {
        ...commentObj,
        userId: userObj,
        user: userObj,
        isLiked: currentUserId ? likedCommentIds.has(comment._id.toString()) : false,
        isCommented: isCommented,
        isStoryLiked: isStoryLiked,
        isFollowing
      };
    });

    return {
      comments: commentsWithFullStatus,
      isCommented,
      isStoryLiked,
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

  public async deleteStory(userId: string, storyId: string) {
    if (!mongoose.Types.ObjectId.isValid(storyId)) {
      throw new Error('Invalid story ID');
    }

    const story = await Story.findById(storyId);
    if (!story) {
      throw new Error('Story not found');
    }

    const user = await User.findById(userId).select('userRole');
    const isOwner = story.userId.toString() === userId.toString();
    const isAdmin = user && user.userRole === 'admin';

    if (!isOwner && !isAdmin) {
      throw new Error('Unauthorized to delete this story');
    }

    await Story.findByIdAndDelete(storyId);
    await Comment.deleteMany({ storyId });
    await Like.deleteMany({ targetId: storyId, targetType: 'Story' });

    return { success: true };
  }

  public async deleteComment(userId: string, commentId: string) {
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      throw new Error('Invalid comment ID');
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }

    const story = await Story.findById(comment.storyId);
    const user = await User.findById(userId).select('userRole');

    const isCommentOwner = comment.userId.toString() === userId.toString();
    const isStoryOwner = story && story.userId.toString() === userId.toString();
    const isAdmin = user && user.userRole === 'admin';

    if (!isCommentOwner && !isStoryOwner && !isAdmin) {
      throw new Error('Unauthorized to delete this comment');
    }

    await Comment.findByIdAndDelete(commentId);
    if (story) {
      await Story.findByIdAndUpdate(story._id, { $inc: { commentsCount: -1 } });
    }
    await Like.deleteMany({ targetId: commentId, targetType: 'Comment' });

    return { success: true };
  }
}
