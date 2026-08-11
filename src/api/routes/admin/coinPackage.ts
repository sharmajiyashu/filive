import { Router, Response } from 'express';
import CoinPackage from '../../../models/CoinPackage';
import CoinHistory from '../../../models/CoinHistory';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const coinPackageRouter = Router();

  router.use('/coin-package', adminAuthMiddleware, coinPackageRouter);

  coinPackageRouter.get('/', async (req: any, res: Response) => {
    try {
      const packages = await CoinPackage.find().sort({ coins: 1 });

      // Calculate monthly date range (start of current month)
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Aggregate all recharge transactions for current month
      const monthlyRechargeHistory = await CoinHistory.find({
        type: 'recharge',
        createdAt: { $gte: startOfMonth },
      });

      // Calculate total statistics
      const totalMonthlyCoins = monthlyRechargeHistory.reduce((acc, curr) => acc + (curr.amount || 0), 0);

      // Calculate package specific sales metrics
      const packageStatsMap: Record<string, { totalOrders: number; totalCoins: number; totalRevenue: number }> = {};

      packages.forEach(pkg => {
        packageStatsMap[pkg._id.toString()] = { totalOrders: 0, totalCoins: 0, totalRevenue: 0 };
      });

      monthlyRechargeHistory.forEach(history => {
        if (history.packageId && packageStatsMap[history.packageId.toString()]) {
          packageStatsMap[history.packageId.toString()].totalOrders += 1;
          packageStatsMap[history.packageId.toString()].totalCoins += history.amount || 0;
        }
      });

      // Calculate revenue per package
      let totalMonthlyRevenueUsd = 0;
      const packagesWithStats = packages.map(pkg => {
        const pkgObj = pkg.toObject();
        const stats = packageStatsMap[pkg._id.toString()] || { totalOrders: 0, totalCoins: 0, totalRevenue: 0 };
        const totalRevenue = stats.totalOrders * pkg.price;
        totalMonthlyRevenueUsd += totalRevenue;

        return {
          ...pkgObj,
          monthlyStats: {
            totalOrders: stats.totalOrders,
            totalCoins: stats.totalCoins,
            totalRevenueUsd: totalRevenue,
          }
        };
      });

      return ResponseWrapper.success(res, {
        packages: packagesWithStats,
        summary: {
          monthlyRechargeCoins: totalMonthlyCoins,
          monthlyRevenueUsd: totalMonthlyRevenueUsd,
          monthlyTotalOrders: monthlyRechargeHistory.length,
          monthName: startOfMonth.toLocaleString('default', { month: 'long', year: 'numeric' }),
        }
      }, 'Coin packages with monthly statistics fetched successfully');
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

  /**
   * @swagger
   * /admin/coin-package/recharge-history:
   *   get:
   *     summary: Get coin recharge history list with pagination and payment gateway filters (Admin)
   *     tags: [Admin - Coin Packages]
   */
  coinPackageRouter.get('/recharge-history', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const search = req.query.search?.toString();
      const gateway = req.query.gateway?.toString(); // 'all', 'razorpay', 'pandapay'

      const query: any = { type: 'recharge' };

      // Gateway filter
      if (gateway === 'razorpay') {
        query.$or = [
          { description: /razorpay/i },
          { transactionId: /^pay_/i }
        ];
      } else if (gateway === 'pandapay') {
        query.$or = [
          { description: /pandapay/i },
          { transactionId: /^PANDA_/i }
        ];
      }

      // Search filter
      if (search) {
        const searchRegex = new RegExp(search, 'i');
        const numSearch = Number(search);
        
        // Find matching users first
        const User = (await import('../../../models/User')).default;
        const matchingUsers = await User.find({
          $or: [
            { name: searchRegex },
            { email: searchRegex },
            ...(!isNaN(numSearch) ? [{ userId: numSearch }] : [])
          ]
        }).select('_id');
        const matchingUserIds = matchingUsers.map((u: any) => u._id);

        const searchConditions: any[] = [
          { transactionId: searchRegex },
          { description: searchRegex },
          { userId: { $in: matchingUserIds } }
        ];

        if (query.$or) {
          query.$and = [
            { $or: query.$or },
            { $or: searchConditions }
          ];
          delete query.$or;
        } else {
          query.$or = searchConditions;
        }
      }

      const total = await CoinHistory.countDocuments(query);
      const history = await CoinHistory.find(query)
        .populate({
          path: 'userId',
          select: 'userId name email profileImage mobile',
          populate: { path: 'profileImage' }
        })
        .populate('packageId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      // Enhance history items with detected gateway name
      const historyWithGateway = history.map((item: any) => {
        const itemObj = item.toObject();
        let gatewayName = 'PandaPay';
        const desc = (item.description || '').toLowerCase();
        const txId = item.transactionId || '';
        
        if (desc.includes('razorpay') || txId.startsWith('pay_')) {
          gatewayName = 'Razorpay';
        } else if (desc.includes('pandapay') || txId.startsWith('PANDA_')) {
          gatewayName = 'PandaPay';
        } else if (txId) {
          gatewayName = 'Online Gateway';
        }

        return {
          ...itemObj,
          gatewayName,
        };
      });

      return ResponseWrapper.success(res, {
        history: historyWithGateway,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      }, 'Recharge history fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
