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

    // Reset active/busy calls stuck in 'initiated' or 'accepted' state on server startup
    try {
        const Call = (await import('../../models/Call')).default;
        const initiatedReset = await Call.updateMany(
            { status: 'initiated' },
            { status: 'missed', endedAt: new Date() }
        );
        const acceptedReset = await Call.updateMany(
            { status: 'accepted' },
            { status: 'ended', endedAt: new Date() }
        );
        AppLogger.info(`🧹 Startup cleanup: Reset ${initiatedReset.modifiedCount} initiated calls to 'missed' and ${acceptedReset.modifiedCount} accepted calls to 'ended'.`);
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

    expressLoader(expressApp);
    startAgencySettlementJob();
    AppLogger.info('✌️ Express Loaded Successfully');
};
