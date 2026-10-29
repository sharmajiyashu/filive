import { Service, Container } from 'typedi';
import mongoose from 'mongoose';
import Report, { IReport, ReportType, ReportStatus, ReportPriority, ReportAction } from '../../models/Report';
import Appeal, { IAppeal, AppealStatus, AppealOutcome } from '../../models/Appeal';
import User from '../../models/User';
import Room from '../../models/Room';
import Story from '../../models/Story';
import { ReportService } from '../app/ReportService';
import AppLogger from '../../api/loaders/logger';

@Service()
export class ReportAdminService {
  private reportService = Container.get(ReportService);

  /**
   * Get summary statistics for Reports Dashboard
   */
  public async getReportsStats() {
    const [
      total,
      pending,
      underReview,
      resolved,
      rejected,
      postCount,
      storyCount,
      profileCount,
      liveRoomCount,
      partyRoomCount,
      chatCount,
      totalAppeals,
      pendingAppeals,
    ] = await Promise.all([
      Report.countDocuments({}),
      Report.countDocuments({ status: 'pending' }),
      Report.countDocuments({ status: 'under_review' }),
      Report.countDocuments({ status: 'resolved' }),
      Report.countDocuments({ status: 'rejected' }),
      Report.countDocuments({ reportType: 'post' }),
      Report.countDocuments({ reportType: 'story' }),
      Report.countDocuments({ reportType: 'profile' }),
      Report.countDocuments({ reportType: 'live_room' }),
      Report.countDocuments({ reportType: 'party_room' }),
      Report.countDocuments({ reportType: { $in: ['chat', 'message'] } }),
      Appeal.countDocuments({}),
      Appeal.countDocuments({ status: 'pending' }),
    ]);

    return {
      total,
      pending,
      underReview,
      resolved,
      rejected,
      byCategory: {
        post: postCount,
        story: storyCount,
        profile: profileCount,
        live_room: liveRoomCount,
        party_room: partyRoomCount,
        chat: chatCount,
      },
      appeals: {
        total: totalAppeals,
        pending: pendingAppeals,
      },
    };
  }

  /**
   * Get paginated list of reports with filters and group counts
   */
  public async getReports(opts: {
    page?: number;
    limit?: number;
    reportType?: string;
    status?: string;
    priority?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.max(1, Math.min(100, opts.limit || 10));
    const skip = (page - 1) * limit;

    const query: any = {};

    if (opts.reportType && opts.reportType !== 'all') {
      if (opts.reportType === 'chat' || opts.reportType === 'message') {
        query.reportType = { $in: ['chat', 'message'] };
      } else {
        query.reportType = opts.reportType;
      }
    }

    if (opts.status && opts.status !== 'all') {
      query.status = opts.status;
    }

    if (opts.priority && opts.priority !== 'all') {
      query.priority = opts.priority;
    }

    if (opts.startDate || opts.endDate) {
      query.createdAt = {};
      if (opts.startDate) query.createdAt.$gte = new Date(opts.startDate);
      if (opts.endDate) {
        const end = new Date(opts.endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    if (opts.search?.trim()) {
      const searchRegex = new RegExp(opts.search.trim(), 'i');
      const numericId = Number(opts.search.trim());

      let matchedUserIds: mongoose.Types.ObjectId[] = [];
      const userQuery: any = {
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          ...(isNaN(numericId) ? [] : [{ userId: numericId }]),
        ],
      };
      const matchingUsers = await User.find(userQuery).select('_id').lean();
      matchedUserIds = matchingUsers.map((u) => u._id as mongoose.Types.ObjectId);

      query.$or = [
        { reportId: searchRegex },
        { reason: searchRegex },
        { description: searchRegex },
        { reporterId: { $in: matchedUserIds } },
        { reportedUserId: { $in: matchedUserIds } },
      ];
    }

    // Priority ordering: urgent > high > medium > low, then createdAt -1
    const [reports, total] = await Promise.all([
      Report.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'reporterId',
          select: 'name email userId profileImage',
          populate: { path: 'profileImage' },
        })
        .populate({
          path: 'reportedUserId',
          select: 'name email userId profileImage isBlocked deviceBan',
          populate: { path: 'profileImage' },
        })
        .populate('assignedAdminId', 'name email')
        .populate('appealId')
        .lean(),
      Report.countDocuments(query),
    ]);

    // Enhance reports with duplicate/multiple complaint counts
    const groupKeys = reports.map((r) => r.complaintGroupKey).filter(Boolean);
    let countsMap: Record<string, number> = {};

    if (groupKeys.length > 0) {
      const groupCounts = await Report.aggregate([
        { $match: { complaintGroupKey: { $in: groupKeys } } },
        { $group: { _id: '$complaintGroupKey', count: { $sum: 1 } } },
      ]);
      countsMap = Object.fromEntries(groupCounts.map((g) => [g._id, g.count]));
    }

    const enhancedReports = reports.map((r) => ({
      ...r,
      complaintCount: r.complaintGroupKey ? countsMap[r.complaintGroupKey] || 1 : 1,
    }));

    return {
      reports: enhancedReports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get single report details by ID or reportId
   */
  public async getReportById(id: string) {
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { reportId: id }] } : { reportId: id };

    const report = await Report.findOne(query)
      .populate({
        path: 'reporterId',
        select: 'name email userId mobile profileImage createdAt',
        populate: { path: 'profileImage' },
      })
      .populate({
        path: 'reportedUserId',
        select: 'name email userId mobile profileImage isBlocked deviceBan blockReason createdAt',
        populate: { path: 'profileImage' },
      })
      .populate('assignedAdminId', 'name email')
      .populate('appealId')
      .lean();

    if (!report) throw new Error('Report not found');

    // Fetch related reports under same complaint group if exists
    let relatedReports: any[] = [];
    if (report.complaintGroupKey) {
      relatedReports = await Report.find({
        complaintGroupKey: report.complaintGroupKey,
        _id: { $ne: report._id },
      })
        .select('reportId reportType reason status createdAt reporterId')
        .populate('reporterId', 'name userId')
        .limit(10)
        .lean();
    }

    return {
      ...report,
      relatedReports,
      complaintCount: (relatedReports?.length || 0) + 1,
    };
  }

  /**
   * Update report status (e.g. mark under review, reject, resolve)
   */
  public async updateReportStatus(
    id: string,
    status: ReportStatus,
    adminId?: string,
    adminName?: string,
    notes?: string
  ) {
    const report = await Report.findById(id);
    if (!report) throw new Error('Report not found');

    const previousStatus = report.status;
    report.status = status;
    if (notes) {
      report.adminNotes = notes;
    }

    report.actionHistory.push({
      adminId: adminId ? new mongoose.Types.ObjectId(adminId) : undefined,
      adminName: adminName || 'Admin',
      action: `STATUS_CHANGE_TO_${status.toUpperCase()}`,
      reason: notes || `Status changed from ${previousStatus} to ${status}`,
      notes,
      timestamp: new Date(),
    });

    await report.save();

    // Trigger automated system message if marked Under Review
    if (status === 'under_review') {
      await this.reportService.sendOfficialSystemMessage(
        report.reporterId.toString(),
        'Report Under Review',
        `Your report (${report.reportId}) is currently being reviewed by our moderation team.`,
        { reportId: report.reportId, status: 'under_review' }
      );
    } else if (status === 'rejected') {
      await this.reportService.sendOfficialSystemMessage(
        report.reporterId.toString(),
        'Report Closed — No Violation Found',
        "Your report has been reviewed by our moderation team. We did not find a violation of Filive's policies based on the available evidence. Thank you for bringing this matter to our attention.",
        { reportId: report.reportId, status: 'rejected' }
      );
    }

    return report;
  }

  /**
   * Take administrative action on a report
   * (e.g., Warning, Suspend, Ban, Content Removed, Room Closed)
   * Enforces privacy protection: Reported user NEVER sees reporter's info!
   */
  public async takeAction(
    id: string,
    adminUser: { id?: string; name?: string },
    data: {
      action: ReportAction;
      reason: string;
      notes?: string;
      banDurationDays?: number;
      dismissOthersInGroup?: boolean;
    }
  ) {
    const report = await Report.findById(id);
    if (!report) throw new Error('Report not found');

    const action = data.action;
    const reason = data.reason || report.reason;
    const notes = data.notes || '';

    // Enforce action on the reported target entity
    if (report.reportedUserId) {
      const targetUserId = report.reportedUserId.toString();

      if (action === 'warning') {
        // Send official warning message
        await this.reportService.sendOfficialSystemMessage(
          targetUserId,
          'Official Community Warning',
          `You have received an official warning regarding your behavior/content on Filive (${reason}). Please review Filive's Community Guidelines to ensure your account remains in good standing. If you believe this was issued in error, you may file an appeal.`,
          {
            reportId: report.reportId,
            type: 'community_warning',
            appealEligible: true,
          }
        );
      } else if (action === 'ban_temporary') {
        const days = data.banDurationDays || 7;
        const blockedUntil = new Date();
        blockedUntil.setDate(blockedUntil.getDate() + days);

        await User.findByIdAndUpdate(targetUserId, {
          isBlocked: true,
          blockedUntil,
          blockReason: reason,
        });

        await this.reportService.sendOfficialSystemMessage(
          targetUserId,
          'Account Suspended Temporarily',
          `Your account has been temporarily suspended for ${days} days due to a policy violation: "${reason}". Suspension expires on ${blockedUntil.toDateString()}. You may submit an appeal if you believe this action was made in error.`,
          {
            reportId: report.reportId,
            type: 'temporary_ban',
            appealEligible: true,
          }
        );
      } else if (action === 'ban_permanent') {
        await User.findByIdAndUpdate(targetUserId, {
          isBlocked: true,
          deviceBan: true,
          blockReason: reason,
        });

        await this.reportService.sendOfficialSystemMessage(
          targetUserId,
          'Account Suspended Permanently',
          `Your account has been permanently suspended due to severe or repeated violations of Filive's Community Guidelines: "${reason}". You may file a formal appeal through official support.`,
          {
            reportId: report.reportId,
            type: 'permanent_ban',
            appealEligible: true,
          }
        );
      }
    }

    // If action is story or post removal / ban
    if (['content_removed', 'delete_story', 'ban_story'].includes(action)) {
      const storyTargetId = report.evidence?.storyId || report.evidence?.postId;
      if (storyTargetId) {
        try {
          await Story.findByIdAndUpdate(storyTargetId, {
            isDeleted: true,
            status: 'banned',
            deletedAt: new Date(),
          });
        } catch (err) {
          AppLogger.warn(`[ReportAdminService] could not remove story/post: ${err}`);
        }
      }
    }

    // If action is room closed or banned
    if (['room_closed', 'ban_room'].includes(action) && report.evidence?.roomId) {
      try {
        await Room.findByIdAndUpdate(report.evidence.roomId, {
          isLive: false,
          status: 'ended',
          isBanned: true,
          endedAt: new Date(),
        });
      } catch (err) {
        AppLogger.warn(`[ReportAdminService] could not close/ban room: ${err}`);
      }
    }

    // If action is delete message
    if (action === 'delete_message' && report.evidence?.messageId) {
      try {
        const Message = (await import('../../models/Message')).default;
        await Message.findByIdAndUpdate(report.evidence.messageId, {
          isDeleted: true,
          text: 'This message was removed by moderation for violating community guidelines.',
        });
      } catch (err) {
        AppLogger.warn(`[ReportAdminService] could not delete message: ${err}`);
      }
    }

    // Update Report document
    report.actionTaken = action;
    report.actionDetails = notes || reason;
    report.status = action === 'rejected' ? 'rejected' : 'resolved';
    if (notes) report.adminNotes = notes;

    report.actionHistory.push({
      adminId: adminUser.id ? new mongoose.Types.ObjectId(adminUser.id) : undefined,
      adminName: adminUser.name || 'Admin',
      action,
      reason,
      notes,
      timestamp: new Date(),
    });

    await report.save();

    // Notify Reporter of Action Taken
    if (action === 'rejected') {
      await this.reportService.sendOfficialSystemMessage(
        report.reporterId.toString(),
        'Report Closed — No Violation Found',
        "Your report has been reviewed by our moderation team. We did not find a violation of Filive's policies based on the available evidence. Thank you for bringing this matter to our attention.",
        { reportId: report.reportId, status: 'rejected' }
      );
    } else {
      await this.reportService.sendOfficialSystemMessage(
        report.reporterId.toString(),
        'Report Action Taken',
        "Thank you for reporting this issue. Our moderation team has reviewed your report and taken appropriate action in accordance with Filive's policies. Your contribution helps keep our community safe.",
        { reportId: report.reportId, status: 'resolved' }
      );
    }

    // Optionally resolve all duplicate reports in the same complaint group
    if (data.dismissOthersInGroup && report.complaintGroupKey) {
      await Report.updateMany(
        {
          complaintGroupKey: report.complaintGroupKey,
          _id: { $ne: report._id },
          status: 'pending',
        },
        {
          status: 'resolved',
          actionTaken: action,
          adminNotes: `Resolved collectively with main report ${report.reportId}`,
          $push: {
            actionHistory: {
              adminId: adminUser.id ? new mongoose.Types.ObjectId(adminUser.id) : undefined,
              adminName: adminUser.name || 'Admin',
              action: `RESOLVED_AS_PART_OF_${report.reportId}`,
              reason: 'Group duplicate resolved',
              timestamp: new Date(),
            },
          },
        }
      );
    }

    return report;
  }

  /**
   * Get appeals for admin panel review
   */
  public async getAppeals(opts: { page?: number; limit?: number; status?: string }) {
    const page = Math.max(1, opts.page || 1);
    const limit = Math.max(1, Math.min(100, opts.limit || 10));
    const skip = (page - 1) * limit;

    const query: any = {};
    if (opts.status && opts.status !== 'all') {
      query.status = opts.status;
    }

    const [appeals, total] = await Promise.all([
      Appeal.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'userId',
          select: 'name email userId profileImage isBlocked deviceBan',
          populate: { path: 'profileImage' },
        })
        .populate('reportId')
        .populate('reviewedBy', 'name email')
        .lean(),
      Appeal.countDocuments(query),
    ]);

    return {
      appeals,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Review an appeal and either accept (reverse penalty) or reject
   */
  public async reviewAppeal(
    appealId: string,
    adminUser: { id?: string; name?: string },
    data: {
      status: 'accepted' | 'rejected';
      outcome: AppealOutcome;
      adminNotes: string;
    }
  ) {
    const appeal = await Appeal.findById(appealId);
    if (!appeal) throw new Error('Appeal not found');

    appeal.status = data.status;
    appeal.outcome = data.outcome;
    appeal.adminNotes = data.adminNotes;
    appeal.reviewedBy = adminUser.id ? new mongoose.Types.ObjectId(adminUser.id) : undefined;
    appeal.reviewedAt = new Date();
    await appeal.save();

    // If accepted and outcome is penalty_revoked, unblock user
    if (data.status === 'accepted' && data.outcome === 'penalty_revoked') {
      await User.findByIdAndUpdate(appeal.userId, {
        isBlocked: false,
        deviceBan: false,
        blockedUntil: undefined,
        blockReason: undefined,
      });
    }

    // Notify user of appeal decision
    const userMessage =
      data.status === 'accepted'
        ? `Good news! Your appeal (${appeal.appealId}) has been ACCEPTED. Any penalties associated with this action have been revoked. Thank you for your patience.`
        : `Your appeal (${appeal.appealId}) has been REJECTED after administrative review. Reason/Notes: ${data.adminNotes}.`;

    await this.reportService.sendOfficialSystemMessage(
      appeal.userId.toString(),
      'Appeal Review Decision',
      userMessage,
      {
        appealId: appeal.appealId,
        status: appeal.status,
        outcome: appeal.outcome,
      }
    );

    return appeal;
  }
}
