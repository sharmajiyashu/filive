import { Express } from 'express';
import AppLogger from './logger';
import expressLoader from './express';
import dbLoader from './db';
import dependencyInjector from './di';
import cloudinaryLoader from './cloudinary';
import firebaseLoader from './firebase';
// import smtpLoader from './smtp';

export default async (expressApp: Express): Promise<void> => {
    const mongoConnection = await dbLoader();
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
    AppLogger.info('✌️ Express Loaded Successfully');
};
