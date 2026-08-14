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

  private commentUserPopulate() {
    return {
      path: 'userId',
      select: 'userId name email profileImage bio isPremium location country isVerified lastLoginAt',
      populate: { path: 'profileImage' }
    };
  }

  private replyToUserPopulate() {
    return {
      path: 'replyToUserId',
      select: 'userId name profileImage',
      populate: { path: 'profileImage' }
    };
  }

  private formatCommentUser(userObj: any, isFollowing: boolean) {
    if (!userObj || typeof userObj !== 'object') return userObj;
    const isOnline = userObj.lastLoginAt
      ? new Date(userObj.lastLoginAt).getTime() > Date.now() - 15 * 60 * 1000
      : false;
    return {
      ...userObj,
      isOnline,
      status: isOnline ? 'online' : 'offline',
      isFollowing
    };
  }

  private formatComment(
    comment: any,
    currentUserId?: string,
    followingUserIds?: Set<string>,
    likedCommentIds?: Set<string>,
    isCommented?: boolean,
    isStoryLiked?: boolean
  ) {
    const commentObj = comment.toObject ? comment.toObject() : { ...comment };
    const authorId = comment.userId?._id?.toString() || commentObj.userId?._id?.toString();
    const isFollowing = !!(currentUserId && authorId && followingUserIds?.has(authorId));
    const userObj = this.formatCommentUser(commentObj.userId, isFollowing);
    const replyToUser = commentObj.replyToUserId && typeof commentObj.replyToUserId === 'object'
      ? commentObj.replyToUserId
      : null;

    return {
      ...commentObj,
      userId: userObj,
      user: userObj,
      parentCommentId: commentObj.parentCommentId || null,
      replyToUserId: replyToUser?._id || commentObj.replyToUserId || null,
      replyToUser,
      repliesCount: commentObj.repliesCount || 0,
      replies: commentObj.replies || [],
      isLiked: currentUserId && likedCommentIds ? likedCommentIds.has(comment._id.toString()) : false,
      isCommented: !!isCommented,
      isStoryLiked: !!isStoryLiked,
      isFollowing
    };
  }

  public async commentOnStory(
    userId: string,
    storyId: string,
    content: string,
    parentCommentId?: string
  ) {
    if (!content || !content.trim()) {
      throw new Error('Comment content is required');
    }

    const story = await Story.findById(storyId);
    if (!story) {
      throw new Error('Story not found');
    }

    let resolvedParentId: mongoose.Types.ObjectId | undefined;
    let replyToUserId: mongoose.Types.ObjectId | undefined;

    if (parentCommentId) {
      if (!mongoose.Types.ObjectId.isValid(parentCommentId)) {
        throw new Error('Invalid parent comment ID');
      }
      const parent = await Comment.findById(parentCommentId);
      if (!parent || parent.storyId.toString() !== storyId.toString()) {
        throw new Error('Parent comment not found');
      }
      resolvedParentId = (parent.parentCommentId || parent._id) as mongoose.Types.ObjectId;
      replyToUserId = parent.userId;
      await Comment.findByIdAndUpdate(resolvedParentId, { $inc: { repliesCount: 1 } });
    }

    const comment = await Comment.create({
      userId,
      storyId,
      content: content.trim(),
      parentCommentId: resolvedParentId || null,
      replyToUserId: replyToUserId || null,
    });
    await Story.findByIdAndUpdate(storyId, { $inc: { commentsCount: 1 } });

    const populated = await Comment.findById(comment._id)
      .populate(this.commentUserPopulate())
      .populate(this.replyToUserPopulate());

    return this.formatComment(populated || comment, userId);
  }

  public async getStoryComments(storyId: string, currentUserId?: string, page: number = 1, limit: number = 10) {
    const topLevelQuery = {
      storyId,
      $or: [{ parentCommentId: null }, { parentCommentId: { $exists: false } }]
    };

    const comments = await Comment.find(topLevelQuery)
      .populate(this.commentUserPopulate())
      .populate(this.replyToUserPopulate())
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Comment.countDocuments(topLevelQuery);
    const parentIds = comments.map(c => c._id);

    const replies = parentIds.length > 0
      ? await Comment.find({ storyId, parentCommentId: { $in: parentIds } })
          .populate(this.commentUserPopulate())
          .populate(this.replyToUserPopulate())
          .sort({ createdAt: 1 })
      : [];

    const allComments = [...comments, ...replies];

    let isCommented = false;
    let isStoryLiked = false;
    let followingUserIds = new Set<string>();
    let likedCommentIds = new Set<string>();

    if (currentUserId) {
      const commentIds = allComments.map(c => c._id);
      const authorIds = allComments
        .map(c => c.userId?._id?.toString())
        .filter(Boolean) as string[];
      const [userComment, storyLike, following, commentLikes] = await Promise.all([
        Comment.findOne({ userId: currentUserId, storyId }),
        Like.findOne({ userId: currentUserId, targetId: storyId, targetType: 'Story' }),
        Follow.find({
          followerId: currentUserId,
          followingId: { $in: authorIds },
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

    const repliesByParent = new Map<string, any[]>();
    for (const reply of replies) {
      const parentId = reply.parentCommentId?.toString();
      if (!parentId) continue;
      const formatted = this.formatComment(reply, currentUserId, followingUserIds, likedCommentIds, isCommented, isStoryLiked);
      const list = repliesByParent.get(parentId) || [];
      list.push(formatted);
      repliesByParent.set(parentId, list);
    }

    const commentsWithFullStatus = comments.map(comment => {
      const formatted = this.formatComment(comment, currentUserId, followingUserIds, likedCommentIds, isCommented, isStoryLiked);
      formatted.replies = repliesByParent.get(comment._id.toString()) || [];
      formatted.repliesCount = formatted.replies.length;
      return formatted;
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

    const childReplies = await Comment.find({ parentCommentId: commentId }).select('_id');
    const childIds = childReplies.map(r => r._id);
    const deleteCount = 1 + childIds.length;

    await Comment.deleteMany({ _id: { $in: [comment._id, ...childIds] } });
    if (comment.parentCommentId) {
      await Comment.findByIdAndUpdate(comment.parentCommentId, { $inc: { repliesCount: -1 } });
    }
    if (story) {
      await Story.findByIdAndUpdate(story._id, { $inc: { commentsCount: -deleteCount } });
    }
    await Like.deleteMany({ targetId: { $in: [commentId, ...childIds] }, targetType: 'Comment' });

    return { success: true };
  }
}
