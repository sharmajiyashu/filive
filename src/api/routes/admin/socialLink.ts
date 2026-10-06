import { Router, Request, Response } from 'express';
import Container from 'typedi';
import { SocialLinkService } from '../../../services/admin/SocialLinkService';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const adminRouter = Router();
  const socialLinkService = Container.get(SocialLinkService);

  router.use('/social-links', adminRouter);

  /**
   * @swagger
   * /admin/social-links:
   *   get:
   *     summary: Get all social media links (Admin)
   *     tags: [Admin - Social Links]
   *     responses:
   *       200:
   *         description: List of all social links
   */
  adminRouter.get('/', async (req: Request, res: Response) => {
    try {
      const links = await socialLinkService.getAllSocialLinks();
      return ResponseWrapper.success(res, links, 'Social links fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/social-links:
   *   post:
   *     summary: Create a new social media link (Admin)
   *     tags: [Admin - Social Links]
   */
  adminRouter.post('/', async (req: Request, res: Response) => {
    try {
      const { name, platformKey, icon, handle, url, actionText, color, order, isActive } = req.body;
      if (!name || !url) {
        throw new Error('Platform name and URL are required');
      }

      const newLink = await socialLinkService.createSocialLink({
        name,
        platformKey,
        icon,
        handle,
        url,
        actionText,
        color,
        order,
        isActive,
      });

      return ResponseWrapper.success(res, newLink, 'Social link created successfully', 201);
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/social-links/{id}:
   *   put:
   *     summary: Update a social media link (Admin)
   *     tags: [Admin - Social Links]
   */
  adminRouter.put('/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const updated = await socialLinkService.updateSocialLink(id, req.body);
      return ResponseWrapper.success(res, updated, 'Social link updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/social-links/{id}/toggle-status:
   *   patch:
   *     summary: Toggle enable/disable status (Admin)
   *     tags: [Admin - Social Links]
   */
  adminRouter.patch('/:id/toggle-status', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const updated = await socialLinkService.toggleStatus(id);
      return ResponseWrapper.success(
        res,
        updated,
        `Platform ${updated.isActive ? 'enabled' : 'disabled'} successfully`
      );
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /admin/social-links/{id}:
   *   delete:
   *     summary: Delete a social media link (Admin)
   *     tags: [Admin - Social Links]
   */
  adminRouter.delete('/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await socialLinkService.deleteSocialLink(id);
      return ResponseWrapper.success(res, null, 'Social link deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
