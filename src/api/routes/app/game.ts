import { Router, Response } from 'express';
import Container from 'typedi';
import { GameService } from '../../../services/app/GameService';
import { ResponseWrapper } from '../../responseWrapper';
import { appAuthMiddleware } from '../../middleware/appAuthMiddleware';

export default (router: Router) => {
  const gameService = Container.get(GameService);
  const gameRouter = Router();

  router.use('/game', appAuthMiddleware, gameRouter);

  /**
   * @swagger
   * /app/game:
   *   get:
   *     summary: Get all active games (for mobile app)
   *     tags: [Game]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Active games fetched successfully
   */
  gameRouter.get('/', async (req: any, res: Response) => {
    try {
      const games = await gameService.getActiveGames();
      return ResponseWrapper.success(res, games, 'Active games fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
