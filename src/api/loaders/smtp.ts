import nodemailer from 'nodemailer';
import config from '../../config';
import AppLogger from './logger';

export default async (): Promise<nodemailer.Transporter> => {
    const transporter = nodemailer.createTransport({
        host: config.email.smtp.host,
        port: config.email.smtp.port,
        secure: config.email.smtp.secure,
        auth: {
            user: config.email.smtp.auth.user,
            pass: config.email.smtp.auth.pass
        }
    });

    transporter.verify((error, _success) => {
        if (error) {
            AppLogger.error('❌ SMTP connection failed:', error);
        } else {
            AppLogger.info('✌️ SMTP server is ready to send emails');
        }
    });

    return transporter;
};
