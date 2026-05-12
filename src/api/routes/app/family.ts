import { Router, Request, Response } from 'express';
import Container from 'typedi';
import { FamilyService } from '../../../services/app/FamilyService';
import { ResponseWrapper } from '../../responseWrapper';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';
import upload from '../../middleware/upload';

export default (router: Router) => {
  const familyService = Container.get(FamilyService);
  const familyRouter = Router();

  router.use('/families', appAuthMiddleware, familyRouter);

  /**
   * @swagger
   * /app/families/create:
   *   post:
   *     summary: Create a family
   *     tags: [Families]
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               announcement:
   *                 type: string
   *               tags:
   *                 type: string
   *                 description: JSON string or comma-separated tags
   *               image:
   *                 type: string
   *                 format: binary
   *     responses:
   *       200:
   *         description: Family created
   */
  familyRouter.post('/create', upload.single('image'), async (req: any, res: Response) => {
    try {
      const result = await familyService.createFamily(req.user.id, req.body, req.file);
      return ResponseWrapper.success(res, result, 'Family created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/families/edit/{id}:
   *   put:
   *     summary: Edit a family
   *     tags: [Families]
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               announcement:
   *                 type: string
   *               tags:
   *                 type: string
   *               image:
   *                 type: string
   *                 format: binary
   *     responses:
   *       200:
   *         description: Family updated
   */
  familyRouter.put('/edit/:id', upload.single('image'), async (req: any, res: Response) => {
    try {
      const result = await familyService.editFamily(req.user.id, req.params.id, req.body, req.file);
      return ResponseWrapper.success(res, result, 'Family updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/families/hall:
   *   get:
   *     summary: Get families for Hall (Friends and Populated)
   *     tags: [Families]
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: query
   *         name: type
   *         schema:
   *           type: string
   *           enum: [friends, populated]
   *         description: Type of families to fetch
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 10
   *     responses:
   *       200:
   *         description: Hall details
   */
  familyRouter.get('/hall', async (req: any, res: Response) => {
    try {
      const { type, page, limit } = req.query;
      const result = await familyService.getFamilyHall(
        req.user.id,
        type as any,
        page ? parseInt(page as string) : 1,
        limit ? parseInt(limit as string) : 10
      );
      return ResponseWrapper.success(res, result, 'Family hall fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });


  /**
   * @swagger
   * /app/families/join:
   *   post:
   *     summary: Join a family
   *     tags: [Families]
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               familyId:
   *                 type: string
   *     responses:
   *       200:
   *         description: Joined successfully
   */
  familyRouter.post('/join', async (req: any, res: Response) => {
    try {
      const { familyId } = req.body;
      const result = await familyService.joinFamily(req.user.id, familyId);
      return ResponseWrapper.success(res, result, 'Joined family successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/families/leave:
   *   post:
   *     summary: Leave a family
   *     tags: [Families]
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               familyId:
   *                 type: string
   *     responses:
   *       200:
   *         description: Left successfully
   */
  familyRouter.post('/leave', async (req: any, res: Response) => {
    try {
      const { familyId } = req.body;
      const result = await familyService.leaveFamily(req.user.id, familyId);
      return ResponseWrapper.success(res, result, 'Left family successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/families/{id}:
   *   get:
   *     summary: Get family details and members
   *     tags: [Families]
   *     security:
   *       - BearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Family details
   */
  familyRouter.get('/:id', async (req: Request, res: Response) => {
    try {
      const result = await familyService.getFamilyDetails(req.params.id as string);
      return ResponseWrapper.success(res, result, 'Family details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};

