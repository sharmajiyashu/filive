import { Router, Request, Response } from 'express';
import Country from '../../../models/Country';
import { ResponseWrapper } from '../../responseWrapper';
import { getCountryPhoneCode } from '../../../utils/phoneCountry';

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
      const countries = await Country.find({ isActive: true }).sort({ name: 1 }).lean();
      const formattedCountries = countries.map((country: any) => {
        const intPhoneCode = country.phoneCode ?? country.countryCode ?? getCountryPhoneCode(country.code) ?? null;
        return {
          ...country,
          phoneCode: intPhoneCode,
          countryCode: intPhoneCode,
        };
      });
      return ResponseWrapper.success(res, formattedCountries, 'Countries fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
