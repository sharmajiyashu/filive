import { Router, Request, Response } from 'express';
import Language from '../../../models/Language';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const languageRouter = Router();

  router.use('/languages', languageRouter);

  /**
   * @swagger
   * /app/languages:
   *   get:
   *     summary: Get list of all supported languages
   *     tags: [Languages]
   *     responses:
   *       200:
   *         description: List of languages
   */
  languageRouter.get('/', async (req: Request, res: Response) => {
    try {
      const languages = await Language.find({ isActive: true }).sort({ name: 1 });
      return ResponseWrapper.success(res, languages, 'Languages fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
