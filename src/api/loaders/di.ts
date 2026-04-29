import AppLogger from './logger';
import Container from 'typedi';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import type admin from 'firebase-admin';
import type nodemailer from 'nodemailer';

export default async ({
    mongoConnection,
    cloudinaryClient,
    firebaseApp,
    emailClient,
}: {
    mongoConnection: typeof mongoose;
    cloudinaryClient: typeof cloudinary;
    firebaseApp: admin.app.App | null;
    emailClient: nodemailer.Transporter | any;
}): Promise<void> => {
    Container.set('mongoConnection', mongoConnection);
    Container.set('cloudinaryClient', cloudinaryClient);
    Container.set('firebaseApp', firebaseApp);
    Container.set('emailClient', emailClient || { sendMail: () => Promise.resolve() });
    AppLogger.info('✌️ Dependency Injector Loaded');
};
