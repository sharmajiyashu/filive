import { Express } from 'express';
import AppLogger from './logger';
import expressLoader from './express';
import dbLoader from './db';
import dependencyInjector from './di';
import cloudinaryLoader from './cloudinary';
import firebaseLoader from './firebase';
import { startAgencySettlementJob } from '../../jobs/agencySettlementJob';
import { startStoreExpiryJob } from '../../jobs/storeExpiryJob';
import { startExchangeRateJob } from '../../jobs/exchangeRateJob';
// import smtpLoader from './smtp';

export default async (expressApp: Express): Promise<void> => {
    const mongoConnection = await dbLoader();

    // Ringing calls that never accepted can safely become missed.
    // Accepted calls are not closed here — that would skip billing.
    try {
        const Call = (await import('../../models/Call')).default;
        const initiatedReset = await Call.updateMany(
            { status: 'initiated' },
            { status: 'missed', endedAt: new Date() }
        );
        AppLogger.info(`🧹 Startup cleanup: Reset ${initiatedReset.modifiedCount} initiated calls to 'missed'.`);
    } catch (err: any) {
        AppLogger.error('❌ Failed to run startup cleanup for stuck calls:', err);
    }

    // Startup online status cleanup: Reset stale online flags from past server runs
    try {
        const User = (await import('../../models/User')).default;
        const UserOnlineSession = (await import('../../models/UserOnlineSession')).default;
        const onlineReset = await User.updateMany({ isOnline: true }, { $set: { isOnline: false } });
        if (onlineReset.modifiedCount > 0) {
            AppLogger.info(`🧹 Startup cleanup: Reset ${onlineReset.modifiedCount} stale online users to offline.`);
        }
        await UserOnlineSession.updateMany(
            { isClosed: false },
            { $set: { isClosed: true, endTime: new Date() } }
        );
    } catch (err: any) {
        AppLogger.error('❌ Failed to reset online statuses on startup:', err);
    }

    // Auto-migration: Move any legacy 'entity' store items and activeEntity user fields to 'entry' / activeEntry
    try {
        const StoreItem = (await import('../../models/StoreItem')).default;
        const User = (await import('../../models/User')).default;

        const storeResult = await StoreItem.collection.updateMany(
            { type: 'entity' } as any,
            { $set: { type: 'entry' } }
        );
        if (storeResult.modifiedCount > 0) {
            AppLogger.info(`🧹 Startup migration: Updated ${storeResult.modifiedCount} store items from 'entity' to 'entry'.`);
        }

        const userResult = await User.collection.updateMany(
            { activeEntity: { $exists: true, $ne: null } } as any,
            [
                {
                    $set: {
                        activeEntry: { $ifNull: ['$activeEntry', '$activeEntity'] }
                    }
                },
                {
                    $unset: 'activeEntity'
                }
            ] as any
        );
        if (userResult.modifiedCount > 0) {
            AppLogger.info(`🧹 Startup migration: Migrated ${userResult.modifiedCount} users from activeEntity to activeEntry.`);
        }

        // Clean any empty strings on unique/sparse indexes to prevent E11000 duplicate key errors
        await User.collection.updateMany({ email: '' } as any, { $unset: { email: 1 } });
        await User.collection.updateMany({ mobile: '' } as any, { $unset: { mobile: 1 } });
        await User.collection.updateMany({ whatsapp: '' } as any, { $unset: { whatsapp: 1 } });
        await User.collection.updateMany({ hostVerificationCode: '' } as any, { $unset: { hostVerificationCode: 1 } });
        await User.collection.updateMany({ referralCode: '' } as any, { $unset: { referralCode: 1 } });
        await User.collection.updateMany({ referCode: '' } as any, { $unset: { referCode: 1 } });
    } catch (err: any) {
        AppLogger.error('❌ Failed to run entity->entry store migration:', err);
    }

    const cloudinaryClient = await cloudinaryLoader();
    const firebaseApp = firebaseLoader();
    // const emailClient = await smtpLoader();

    await dependencyInjector({
        mongoConnection,
        cloudinaryClient,
        firebaseApp,
        emailClient: null,
    });

    try {
        const { Container } = await import('typedi');
        const { CallService } = await import('../../services/app/CallService');
        const staleCount = await Container.get(CallService).settleStaleAcceptedCalls();
        if (staleCount > 0) {
            AppLogger.info(`🧹 Startup cleanup: Settled ${staleCount} stale accepted call(s) through billing.`);
        }
    } catch (err: any) {
        AppLogger.error('❌ Failed to settle stale accepted calls:', err);
    }

    expressLoader(expressApp);
    startAgencySettlementJob();
    startStoreExpiryJob();
    startExchangeRateJob();
    AppLogger.info('✌️ Express Loaded Successfully');
};
