import { Router, Response } from 'express';
import User from '../../../models/User';
import Story from '../../../models/Story';
import CoinHistory from '../../../models/CoinHistory';
import { ResponseWrapper } from '../../responseWrapper';

export default (router: Router) => {
  const dashboardRouter = Router();

  router.use('/dashboard', dashboardRouter);

  /**
   * @swagger
   * /admin/dashboard/stats:
   *   get:
   *     summary: Get dashboard statistics (Admin)
   *     tags: [Admin - Dashboard]
   *     responses:
   *       200:
   *         description: Stats fetched successfully
   */
  dashboardRouter.get('/stats', async (req: any, res: Response) => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      // 1. Total Users
      const totalUsers = await User.countDocuments({ userRole: 'user' });

      // 2. New Registrations (last 30 days vs previous 30 days for comparison)
      const newRegistrationsThisMonth = await User.countDocuments({
        userRole: 'user',
        createdAt: { $gte: thirtyDaysAgo }
      });
      const newRegistrationsLastMonth = await User.countDocuments({
        userRole: 'user',
        createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo }
      });

      let registrationComparison = 0;
      if (newRegistrationsLastMonth > 0) {
        registrationComparison = Math.round(
          ((newRegistrationsThisMonth - newRegistrationsLastMonth) / newRegistrationsLastMonth) * 100
        );
      } else if (newRegistrationsThisMonth > 0) {
        registrationComparison = 100;
      }

      // 3. Stories Created Today
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const storiesToday = await Story.countDocuments({
        createdAt: { $gte: startOfToday }
      });

      // 4. Total Recharge Value (sum of all history of type 'recharge')
      const totalRechargeRecords = await CoinHistory.aggregate([
        { $match: { type: 'recharge' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const totalRechargeValue = totalRechargeRecords[0]?.total || 0;

      // 5. This Month's Recharge Value (since start of current calendar month)
      const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisMonthRechargeRecords = await CoinHistory.aggregate([
        { $match: { type: 'recharge', createdAt: { $gte: startOfCurrentMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const thisMonthRechargeValue = thisMonthRechargeRecords[0]?.total || 0;

      // Weekly Trend: registrations & recharges per day for the last 7 days
      const weeklyTrend = [];
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

        const dailyRegistrations = await User.countDocuments({
          userRole: 'user',
          createdAt: { $gte: startOfDay, $lt: endOfDay }
        });

        const dailyRechargeRecords = await CoinHistory.aggregate([
          {
            $match: {
              type: 'recharge',
              createdAt: { $gte: startOfDay, $lt: endOfDay }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' }
            }
          }
        ]);
        const dailyRechargeVal = dailyRechargeRecords[0]?.total || 0;

        weeklyTrend.push({
          label: dayNames[d.getDay()],
          registrations: dailyRegistrations,
          recharges: dailyRechargeVal
        });
      }

      // Monthly Trend: registrations & recharges per month for the last 6 calendar months
      const monthlyTrend = [];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
        const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);

        const monthlyRegistrations = await User.countDocuments({
          userRole: 'user',
          createdAt: { $gte: startOfMonth, $lt: endOfMonth }
        });

        const monthlyRechargeRecords = await CoinHistory.aggregate([
          {
            $match: {
              type: 'recharge',
              createdAt: { $gte: startOfMonth, $lt: endOfMonth }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' }
            }
          }
        ]);
        const monthlyRechargeVal = monthlyRechargeRecords[0]?.total || 0;

        monthlyTrend.push({
          label: monthNames[d.getMonth()] + ' ' + String(d.getFullYear()).slice(-2),
          registrations: monthlyRegistrations,
          recharges: monthlyRechargeVal
        });
      }

      const stats = {
        totalUsers: {
          value: totalUsers,
          label: 'Total Users',
          comparison: 0
        },
        newRegistrations: {
          value: newRegistrationsThisMonth,
          label: 'New Registrations',
          comparison: registrationComparison
        },
        storiesToday: {
          value: storiesToday,
          label: 'Stories Created Today',
          comparison: 0
        },
        totalRecharge: {
          value: totalRechargeValue,
          label: 'Total Recharges',
          comparison: 0
        },
        thisMonthRecharge: {
          value: thisMonthRechargeValue,
          label: 'This Month Recharges',
          comparison: 0
        },
        weeklyTrend,
        monthlyTrend
      };

      return ResponseWrapper.success(res, stats, 'Dashboard statistics fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
