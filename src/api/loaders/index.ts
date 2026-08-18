import { Express } from 'express';
import AppLogger from './logger';
import expressLoader from './express';
import dbLoader from './db';
import dependencyInjector from './di';
import cloudinaryLoader from './cloudinary';
import firebaseLoader from './firebase';
import { startAgencySettlementJob } from '../../jobs/agencySettlementJob';
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
    AppLogger.info('✌️ Express Loaded Successfully');
};
