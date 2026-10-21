import { Router, Response } from 'express';
import Container from 'typedi';
import mongoose from 'mongoose';
import { CloudinaryService } from '../../../services/common/CloudinaryService';
import { MediaService } from '../../../services/common/MediaService';
import { MediaType } from '../../../constants/enum';
import Hashtag from '../../../models/Hashtag';
import { ResponseWrapper } from '../../responseWrapper';
import upload from '../../middleware/upload';

export default (router: Router) => {
  const hashtagRouter = Router();
  const cloudinaryService = Container.get(CloudinaryService);
  const mediaService = Container.get(MediaService);

  router.use('/hashtags', hashtagRouter);

  /**
   * Helper to clean hashtag name
   */
  const cleanHashtagName = (rawName: string): string => {
    return (rawName || '').trim().replace(/^#+/, '');
  };

  /**
   * @swagger
   * /admin/hashtags:
   *   get:
   *     summary: Get all hashtags with filters, search, pagination, and summary statistics (Admin)
   *     tags: [Admin - Hashtags]
   */
  hashtagRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = req.query.page ? parseInt(req.query.page.toString(), 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit.toString(), 10) : 10;
      const search = req.query.search?.toString().trim();
      const status = req.query.status?.toString(); // 'all', 'active', 'inactive'
      const trending = req.query.trending?.toString(); // 'all', 'true', 'false'
      const category = req.query.category?.toString();
      const sortBy = req.query.sortBy?.toString() || 'order'; // 'order', 'usageCount', 'name', 'createdAt'
      const sortOrder = req.query.sortOrder?.toString() === 'desc' ? -1 : 1;

      const query: any = {};

      if (status === 'active') {
        query.isActive = true;
      } else if (status === 'inactive') {
        query.isActive = false;
      }

      if (trending === 'true') {
        query.isTrending = true;
      } else if (trending === 'false') {
        query.isTrending = false;
      }

      if (category && category !== 'all') {
        query.category = category;
      }

      if (search) {
        const cleanSearch = cleanHashtagName(search);
        const searchRegex = new RegExp(cleanSearch, 'i');
        query.$or = [{ name: searchRegex }, { description: searchRegex }, { category: searchRegex }];
      }

      // Sort configuration
      const sortConfig: any = {};
      if (sortBy === 'order') {
        sortConfig.order = sortOrder;
        sortConfig.createdAt = -1;
      } else if (sortBy === 'usageCount') {
        sortConfig.usageCount = sortOrder;
      } else if (sortBy === 'name') {
        sortConfig.name = sortOrder;
      } else {
        sortConfig.createdAt = sortOrder;
      }

      // If page is specifically requested or standard table query
      const skip = (page - 1) * limit;

      const [hashtags, total, totalHashtags, activeHashtags, trendingHashtags, usageStats] = await Promise.all([
        Hashtag.find(query).populate('image').sort(sortConfig).skip(skip).limit(limit),
        Hashtag.countDocuments(query),
        Hashtag.countDocuments(),
        Hashtag.countDocuments({ isActive: true }),
        Hashtag.countDocuments({ isTrending: true }),
        Hashtag.aggregate([
          {
            $group: {
              _id: null,
              totalUsage: { $sum: '$usageCount' },
            },
          },
        ]),
      ]);

      const totalUsageCount = usageStats.length > 0 ? usageStats[0].totalUsage : 0;

      return ResponseWrapper.success(
        res,
        {
          hashtags,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
          },
          summary: {
            totalHashtags,
            activeHashtags,
            trendingHashtags,
            totalUsageCount,
          },
        },
        'Hashtags fetched successfully'
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/hashtags:
   *   post:
   *     summary: Create a new hashtag (Admin)
   *     tags: [Admin - Hashtags]
   */
  hashtagRouter.post('/', upload.single('image'), async (req: any, res: Response) => {
    try {
      const { name, description, isTrending, isActive, order, category, mediaId, imageId } = req.body;

      if (!name || !name.trim()) {
        return ResponseWrapper.error(res, new Error('Hashtag name is required'), 400);
      }

      const cleanedName = cleanHashtagName(name);

      // Check for duplicate name
      const existing = await Hashtag.findOne({
        name: { $regex: new RegExp(`^${cleanedName}$`, 'i') },
      });
      if (existing) {
        return ResponseWrapper.error(res, new Error(`Hashtag #${cleanedName} already exists`), 400);
      }

      let targetImageId = mediaId || imageId;

      if (req.file) {
        const uploadResults = await cloudinaryService.uploadMedia(MediaType.image, [req.file], 'hashtags');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          targetImageId = media._id;
        }
      }

      const hashtag = await Hashtag.create({
        name: cleanedName,
        description: description ? description.trim() : '',
        category: category ? category.trim() : 'general',
        order: order !== undefined ? Number(order) : 0,
        isTrending: isTrending === 'true' || isTrending === true,
        isActive: isActive !== undefined ? isActive === 'true' || isActive === true : true,
        image: targetImageId,
      });

      const populatedHashtag = await Hashtag.findById(hashtag._id).populate('image');
      return ResponseWrapper.success(res, populatedHashtag, 'Hashtag created successfully', 201);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/hashtags/{id}:
   *   put:
   *     summary: Update an existing hashtag (Admin)
   *     tags: [Admin - Hashtags]
   */
  hashtagRouter.put('/:id', upload.single('image'), async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const { name, description, isTrending, isActive, order, category, mediaId, imageId } = req.body;

      const hashtag = await Hashtag.findById(id);
      if (!hashtag) {
        return ResponseWrapper.error(res, new Error('Hashtag not found'), 404);
      }

      const updateData: any = {};

      if (name) {
        const cleanedName = cleanHashtagName(name);
        if (cleanedName.toLowerCase() !== hashtag.name.toLowerCase()) {
          const duplicate = await Hashtag.findOne({
            _id: { $ne: id },
            name: { $regex: new RegExp(`^${cleanedName}$`, 'i') },
          });
          if (duplicate) {
            return ResponseWrapper.error(res, new Error(`Hashtag #${cleanedName} already exists`), 400);
          }
        }
        updateData.name = cleanedName;
      }

      if (description !== undefined) updateData.description = description.trim();
      if (category !== undefined) updateData.category = category.trim();
      if (order !== undefined) updateData.order = Number(order);
      if (isTrending !== undefined) updateData.isTrending = isTrending === 'true' || isTrending === true;
      if (isActive !== undefined) updateData.isActive = isActive === 'true' || isActive === true;

      if (req.file) {
        const uploadResults = await cloudinaryService.uploadMedia(MediaType.image, [req.file], 'hashtags');
        if (uploadResults.length > 0) {
          const media = await mediaService.createMedia({ ...uploadResults[0] });
          updateData.image = media._id;
        }
      } else if (mediaId || imageId) {
        updateData.image = mediaId || imageId;
      }

      const updatedHashtag = await Hashtag.findByIdAndUpdate(id, updateData, { new: true }).populate('image');
      return ResponseWrapper.success(res, updatedHashtag, 'Hashtag updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/hashtags/{id}/status:
   *   patch:
   *     summary: Quick toggle status (active or trending) of a hashtag (Admin)
   *     tags: [Admin - Hashtags]
   */
  hashtagRouter.patch('/:id/status', async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const { isActive, isTrending } = req.body;

      const updateData: any = {};
      if (isActive !== undefined) {
        updateData.isActive = isActive === 'true' || isActive === true;
      }
      if (isTrending !== undefined) {
        updateData.isTrending = isTrending === 'true' || isTrending === true;
      }

      const hashtag = await Hashtag.findByIdAndUpdate(id, updateData, { new: true }).populate('image');
      if (!hashtag) {
        return ResponseWrapper.error(res, new Error('Hashtag not found'), 404);
      }

      return ResponseWrapper.success(res, hashtag, 'Hashtag status updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/hashtags/{id}:
   *   delete:
   *     summary: Delete a hashtag (Admin)
   *     tags: [Admin - Hashtags]
   */
  hashtagRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const hashtag = await Hashtag.findByIdAndDelete(id);
      if (!hashtag) {
        return ResponseWrapper.error(res, new Error('Hashtag not found'), 404);
      }
      return ResponseWrapper.success(res, null, 'Hashtag deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
