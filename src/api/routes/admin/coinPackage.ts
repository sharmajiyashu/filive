import { Router, Response } from 'express';
import CoinPackage from '../../../models/CoinPackage';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const coinPackageRouter = Router();

  router.use('/coin-package', adminAuthMiddleware, coinPackageRouter);

  coinPackageRouter.get('/', async (req: any, res: Response) => {
    try {
      const packages = await CoinPackage.find().sort({ coins: 1 });
      return ResponseWrapper.success(res, packages, 'Coin packages fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  coinPackageRouter.post('/', async (req: any, res: Response) => {
    try {
      const pkg = await CoinPackage.create(req.body);
      return ResponseWrapper.success(res, pkg, 'Coin package created successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  coinPackageRouter.put('/:id', async (req: any, res: Response) => {
    try {
      const pkg = await CoinPackage.findByIdAndUpdate(req.params.id, req.body, { new: true });
      return ResponseWrapper.success(res, pkg, 'Coin package updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  coinPackageRouter.delete('/:id', async (req: any, res: Response) => {
    try {
      await CoinPackage.findByIdAndDelete(req.params.id);
      return ResponseWrapper.success(res, null, 'Coin package deleted successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
