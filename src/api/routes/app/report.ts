import { Router, Response } from 'express';
import Container from 'typedi';
import { ReportService } from '../../../services/app/ReportService';
import { ResponseWrapper } from '../../responseWrapper';
import upload from '../../middleware/upload';
import { CloudinaryService } from '../../../services/common/CloudinaryService';
import { MediaType } from '../../../constants/enum';

export default (router: Router) => {
  const reportService = Container.get(ReportService);
  const cloudinaryService = Container.get(CloudinaryService);

  /**
   * @swagger
   * /app/reports:
   *   post:
   *     summary: Submit a report (post, profile, live_room, chat)
   *     tags: [Reports]
   *     security:
   *       - bearerAuth: []
   */
  router.post(
    '/reports',
    upload.any(),
    async (req: any, res: Response) => {
      try {
        const userId = req.user.id;
        const {
          reportType,
          reportedUserId,
          reason,
          description,
          targetId,
          postId,
          postMediaUrl,
          postCaption,
          roomId,
          roomTitle,
          liveHostId,
          messageId,
          chatTranscript,
          priority,
        } = req.body;

        const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
        let uploadedMediaUrls: string[] = [];

        if (files.length > 0) {
          const uploadResults = await cloudinaryService.uploadMedia(MediaType.image, files, 'report_evidences');
          uploadedMediaUrls = uploadResults.map((r: any) => r.url);
        }

        // If client passed existing mediaUrls
        let mediaUrls: string[] = [];
        if (req.body.mediaUrls) {
          try {
            const parsed = typeof req.body.mediaUrls === 'string' ? JSON.parse(req.body.mediaUrls) : req.body.mediaUrls;
            if (Array.isArray(parsed)) mediaUrls.push(...parsed);
          } catch {
            mediaUrls.push(req.body.mediaUrls);
          }
        }
        mediaUrls = [...mediaUrls, ...uploadedMediaUrls];

        let parsedTranscript: any[] = [];
        if (chatTranscript) {
          try {
            parsedTranscript = typeof chatTranscript === 'string' ? JSON.parse(chatTranscript) : chatTranscript;
          } catch {
            parsedTranscript = [];
          }
        }

        const report = await reportService.createReport(userId, {
          reportType,
          reportedUserId,
          reason,
          description,
          targetId,
          postId,
          postMediaUrl,
          postCaption,
          roomId,
          roomTitle,
          liveHostId,
          messageId,
          chatTranscript: parsedTranscript,
          mediaUrls,
          priority,
        });

        return ResponseWrapper.success(
          res,
          report,
          'Your report has been submitted successfully. A confirmation message has been sent to your inbox.'
        );
      } catch (error: any) {
        return ResponseWrapper.error(res, error);
      }
    }
  );

  /**
   * @swagger
   * /app/reports/my-reports:
   *   get:
   *     summary: Get all reports submitted by the current user
   *     tags: [Reports]
   *     security:
   *       - bearerAuth: []
   */
  router.get('/reports/my-reports', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page?.toString() || '1');
      const limit = parseInt(req.query.limit?.toString() || '10');

      const result = await reportService.getMyReports(userId, { page, limit });
      return ResponseWrapper.success(res, result, 'User reports fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });

  /**
   * @swagger
   * /app/appeals:
   *   post:
   *     summary: Submit an appeal against an action or penalty
   *     tags: [Appeals]
   *     security:
   *       - bearerAuth: []
   */
  router.post(
    '/appeals',
    upload.any(),
    async (req: any, res: Response) => {
      try {
        const userId = req.user.id;
        const { reportId, reason, explanation } = req.body;

        const files = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
        let uploadedEvidenceUrls: string[] = [];

        if (files.length > 0) {
          const uploadResults = await cloudinaryService.uploadMedia(MediaType.image, files, 'appeal_evidences');
          uploadedEvidenceUrls = uploadResults.map((r: any) => r.url);
        }

        let evidenceUrls: string[] = [];
        if (req.body.evidenceUrls) {
          try {
            const parsed = typeof req.body.evidenceUrls === 'string' ? JSON.parse(req.body.evidenceUrls) : req.body.evidenceUrls;
            if (Array.isArray(parsed)) evidenceUrls.push(...parsed);
          } catch {
            evidenceUrls.push(req.body.evidenceUrls);
          }
        }
        evidenceUrls = [...evidenceUrls, ...uploadedEvidenceUrls];

        const appeal = await reportService.createAppeal(userId, {
          reportId,
          reason,
          explanation,
          evidenceUrls,
        });

        return ResponseWrapper.success(
          res,
          appeal,
          'Your appeal has been submitted successfully and will be reviewed by administrators.'
        );
      } catch (error: any) {
        return ResponseWrapper.error(res, error);
      }
    }
  );

  /**
   * @swagger
   * /app/appeals/my-appeals:
   *   get:
   *     summary: Get all appeals submitted by the current user
   *     tags: [Appeals]
   *     security:
   *       - bearerAuth: []
   */
  router.get('/appeals/my-appeals', async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const appeals = await reportService.getMyAppeals(userId);
      return ResponseWrapper.success(res, appeals, 'User appeals fetched successfully');
    } catch (error: any) {
      return ResponseWrapper.error(res, error);
    }
  });
};
