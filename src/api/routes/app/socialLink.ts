import { Router, Request, Response } from 'express';
import Container from 'typedi';
import { SocialLinkService } from '../../../services/admin/SocialLinkService';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const appRouter = Router();
  const socialLinkService = Container.get(SocialLinkService);

  router.use('/social-links', appRouter);

  /**
   * @swagger
   * /app/social-links:
   *   get:
   *     summary: Get active social media links for mobile app (Follow Us screen)
   *     tags: [App - Social Links]
   *     responses:
   *       200:
   *         description: List of active social media links
   */
  appRouter.get('/', async (req: Request, res: Response) => {
    try {
      const links = await socialLinkService.getActiveSocialLinks();
      return ResponseWrapper.success(res, links, 'Active social links fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
