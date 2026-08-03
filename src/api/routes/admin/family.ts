import { Router, Response } from 'express';
import Family from '../../../models/Family';
import FamilyMember from '../../../models/FamilyMember';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const familyRouter = Router();

  router.use('/family', adminAuthMiddleware, familyRouter);

  familyRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = (req.query.search as string) || '';
      const skip = (page - 1) * limit;

      const query: any = {};
      if (search) {
        query.name = { $regex: search, $options: 'i' };
      }

      const [families, total] = await Promise.all([
        Family.find(query)
          .populate({ path: 'creatorId', select: 'name email mobile userId profileImage', populate: { path: 'profileImage' } })
          .populate('image')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Family.countDocuments(query)
      ]);

      return ResponseWrapper.success(
        res,
        {
          families,
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
          }
        },
        'Families fetched successfully'
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  familyRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      await Promise.all([
        Family.findByIdAndDelete(id),
        FamilyMember.deleteMany({ familyId: id })
      ]);
      return ResponseWrapper.success(res, null, 'Family deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
