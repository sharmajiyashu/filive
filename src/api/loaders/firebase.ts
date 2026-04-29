import * as fs from 'fs';
import * as path from 'path';
import admin from 'firebase-admin';
import config from '../../config';
import AppLogger from './logger';

/**
 * Initializes Firebase Admin for FCM. Returns null if not configured (chat still works over REST).
 */
export default (): admin.app.App | null => {
    try {
        if (admin.apps.length > 0) {
            return admin.app();
        }

        let json: Record<string, unknown> | null = null;

        if (config.firebase.serviceAccountJson) {
            json = JSON.parse(config.firebase.serviceAccountJson) as Record<string, unknown>;
        } else if (config.firebase.serviceAccountPath) {
            const resolved = path.isAbsolute(config.firebase.serviceAccountPath)
                ? config.firebase.serviceAccountPath
                : path.join(process.cwd(), config.firebase.serviceAccountPath);
            const raw = fs.readFileSync(resolved, 'utf8');
            json = JSON.parse(raw) as Record<string, unknown>;
        }

        if (!json) {
            AppLogger.warn(
                'Firebase Admin not initialized: set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON for push notifications.'
            );
            return null;
        }

        admin.initializeApp({
            credential: admin.credential.cert(json as admin.ServiceAccount),
        });
        AppLogger.info('✌️ Firebase Admin initialized');
        return admin.app();
    } catch (error) {
        AppLogger.error('❌ Firebase Admin initialization failed:', error);
        return null;
    }
};
