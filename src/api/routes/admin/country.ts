import { Router, Request, Response } from 'express';
import Country from '../../../models/Country';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const countryRouter = Router();

  router.use('/country', adminAuthMiddleware, countryRouter);

  /**
   * GET /api/admin/country - List all active countries for admin panel
   */
  countryRouter.get('/', async (req: Request, res: Response) => {
    try {
      const countries = await Country.find({ isActive: true }).sort({ name: 1 });
      return ResponseWrapper.success(res, countries, 'Countries fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
