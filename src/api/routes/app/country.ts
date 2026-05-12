import { Router, Request, Response } from 'express';
import Country from '../../../models/Country';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const countryRouter = Router();

  router.use('/countries', countryRouter);

  /**
   * @swagger
   * /app/countries:
   *   get:
   *     summary: Get list of all countries with flags
   *     tags: [Countries]
   *     responses:
   *       200:
   *         description: List of countries
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
