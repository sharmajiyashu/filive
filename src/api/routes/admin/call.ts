import { Router, Response } from 'express';
import Container from 'typedi';
import { AdminCallService } from '../../../services/admin/AdminCallService';
import { ResponseWrapper } from '../../responseWrapper';
import { adminAuthMiddleware } from '../../middleware/adminAuthMiddleware';

export default (router: Router) => {
  const callService = Container.get(AdminCallService);
  const callRouter = Router();

  router.use('/calls', adminAuthMiddleware, callRouter);

  callRouter.get('/stats', async (_req: any, res: Response) => {
    try {
      const result = await callService.getStats();
      return ResponseWrapper.success(res, result, 'Call stats fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  callRouter.get('/', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');
      const search = req.query.search?.toString();
      const status = req.query.status?.toString();
      const type = (req.query.type || req.query.callType)?.toString();
      const result = await callService.list({ page, limit, search, status, type });
      return ResponseWrapper.success(res, result, 'Calls fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  callRouter.get('/ranking/config', async (_req: any, res: Response) => {
    try {
      const { HostFeedService } = await import('../../../services/app/HostFeedService');
      const hostFeedService = Container.get(HostFeedService);
      const config = await hostFeedService.getConfig();
      return ResponseWrapper.success(res, config, 'Host ranking config fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  callRouter.put('/ranking/config', async (req: any, res: Response) => {
    try {
      const { HostFeedService } = await import('../../../services/app/HostFeedService');
      const hostFeedService = Container.get(HostFeedService);
      const updated = await hostFeedService.updateConfig(req.body);
      return ResponseWrapper.success(res, updated, 'Host ranking config updated successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  callRouter.post('/ranking/recalculate', async (_req: any, res: Response) => {
    try {
      const { HostFeedService } = await import('../../../services/app/HostFeedService');
      const hostFeedService = Container.get(HostFeedService);
      const result = await hostFeedService.recalculateAllHostScores();
      return ResponseWrapper.success(res, result, 'Host ranking recalculation started/completed');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  callRouter.get('/ranking/hosts', async (req: any, res: Response) => {
    try {
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '20');
      const search = req.query.search?.toString();

      const User = (await import('../../../models/User')).default;
      const HostFeedMetric = (await import('../../../models/HostFeedMetric')).default;

      const query: any = {
        userRole: 'user',
        gender: { $regex: /^female$/i },
        videoVerificationStatus: 'approved',
        isBlocked: false,
        isDeleted: { $ne: true },
      };

      if (search && search.trim()) {
        const s = search.trim();
        query.$or = [
          { name: { $regex: s, $options: 'i' } },
          { email: { $regex: s, $options: 'i' } },
          { country: { $regex: s, $options: 'i' } },
          { countryCode: { $regex: s, $options: 'i' } },
        ];
        const num = Number(s);
        if (!isNaN(num)) query.$or.push({ userId: num });
      }

      const total = await User.countDocuments(query);
      const users = await User.find(query)
        .select('userId name profileImage gender country countryCode callRankingScore enableVoiceCall enableVideoCall newHostEligibleAt lastLoginAt createdAt')
        .populate('profileImage')
        .sort({ callRankingScore: -1, lastLoginAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      const userIds = users.map((u: any) => u._id);
      const metrics = await HostFeedMetric.find({ hostId: { $in: userIds } }).lean();
      const metricMap = new Map(metrics.map((m: any) => [m.hostId.toString(), m]));

      const enriched = users.map((u: any) => {
        const m = metricMap.get(u._id.toString());
        return {
          ...u,
          metric: m || null,
          rankingScore: u.callRankingScore || 50,
        };
      });

      return ResponseWrapper.success(res, {
        hosts: enriched,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      }, 'Ranked hosts fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  callRouter.get('/:id', async (req: any, res: Response) => {
    try {
      const result = await callService.getById(req.params.id);
      return ResponseWrapper.success(res, result, 'Call details fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
