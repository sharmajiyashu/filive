import { Router, Response } from 'express';
import mongoose from 'mongoose';
import Story from '../../../models/Story';
import Comment from '../../../models/Comment';
import User from '../../../models/User';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const storyRouter = Router();

  router.use('/stories', storyRouter);

  /**
   * @swagger
   * /admin/stories:
   *   get:
   *     summary: Get all stories with search, status filters and summary statistics (Admin)
   *     tags: [Admin - Stories]
   */
  storyRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const search = req.query.search?.toString();
      const status = req.query.status?.toString(); // 'all', 'active', 'blocked'

      const query: any = {};

      if (status === 'active') {
        query.isBlocked = false;
      } else if (status === 'blocked') {
        query.isBlocked = true;
      }

      if (search) {
        const searchRegex = new RegExp(search, 'i');
        const numSearch = Number(search);
        
        // Find matching users first
        const userOrConditions: any[] = [
          { name: searchRegex },
          { email: searchRegex },
          ...(!isNaN(numSearch) ? [{ userId: numSearch }] : [])
        ];
        const matchingUsers = await User.find({ $or: userOrConditions }).select('_id');
        const matchingUserIds = matchingUsers.map((u: any) => u._id);

        const storyConditions: any[] = [
          { content: searchRegex },
          { tags: searchRegex },
          { userId: { $in: matchingUserIds } }
        ];

        if (mongoose.Types.ObjectId.isValid(search)) {
          storyConditions.push({ _id: search });
        }

        query.$or = storyConditions;
      }

      const [totalStories, activeStories, blockedStories, filteredTotal] = await Promise.all([
        Story.countDocuments({}),
        Story.countDocuments({ isBlocked: false }),
        Story.countDocuments({ isBlocked: true }),
        Story.countDocuments(query),
      ]);

      const stories = await Story.find(query)
        .populate({
          path: 'userId',
          select: 'userId name email profileImage bio isPremium location country isBlocked',
          populate: { path: 'profileImage' }
        })
        .populate('images')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      return ResponseWrapper.success(res, {
        stories,
        summary: {
          totalStories,
          activeStories,
          blockedStories,
        },
        pagination: {
          total: filteredTotal,
          page,
          limit,
          totalPages: Math.ceil(filteredTotal / limit)
        }
      }, 'Stories fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/stories/{id}/comments:
   *   get:
   *     summary: Get comments for a story (Admin)
   *     tags: [Admin - Stories]
   */
  storyRouter.get('/:id/comments', async (req: any, res: Response) => {
    try {
      const storyId = req.params.id;
      const comments = await Comment.find({ storyId })
        .populate({
          path: 'userId',
          select: 'userId name email profileImage',
          populate: { path: 'profileImage' }
        })
        .sort({ createdAt: -1 });

      return ResponseWrapper.success(res, comments, 'Comments fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/stories/comments/{commentId}:
   *   delete:
   *     summary: Delete a specific comment on a story (Admin)
   *     tags: [Admin - Stories]
   */
  storyRouter.delete('/comments/:commentId', async (req: any, res: Response) => {
    try {
      const { commentId } = req.params;
      const comment = await Comment.findById(commentId);
      if (!comment) {
        throw new Error('Comment not found');
      }

      await Comment.findByIdAndDelete(commentId);
      if (comment.storyId) {
        await Story.findByIdAndUpdate(comment.storyId, { $inc: { commentsCount: -1 } });
      }

      return ResponseWrapper.success(res, null, 'Comment deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/stories/{id}/block:
   *   put:
   *     summary: Toggle story block status (Admin)
   *     tags: [Admin - Stories]
   */
  storyRouter.put('/:id/block', async (req: any, res: Response) => {
    try {
      const storyId = req.params.id;
      const story = await Story.findById(storyId);
      if (!story) {
        throw new Error('Story not found');
      }

      story.isBlocked = !story.isBlocked;
      await story.save();

      return ResponseWrapper.success(res, story, `Story ${story.isBlocked ? 'blocked' : 'unblocked'} successfully`);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/stories/{id}:
   *   delete:
   *     summary: Delete a story completely (Admin)
   *     tags: [Admin - Stories]
   */
  storyRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const storyId = req.params.id;
      await Story.findByIdAndDelete(storyId);
      await Comment.deleteMany({ storyId });
      return ResponseWrapper.success(res, null, 'Story deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
