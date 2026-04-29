import { Service, Inject } from 'typedi';
import admin from 'firebase-admin';
import User from '../../models/User';
import AppLogger from '../../api/loaders/logger';

export interface IChatPushPayload {
    title: string;
    body: string;
    data: Record<string, string>;
}

@Service()
export class FirebasePushService {
    constructor(@Inject('firebaseApp') private readonly firebaseApp: admin.app.App | null) {}

    public async notifyUser(userId: string, payload: IChatPushPayload): Promise<void> {
        if (!this.firebaseApp) {
            AppLogger.warn('FCM skipped: Firebase is not configured');
            return;
        }

        const user = await User.findById(userId).select('fcmTokens').lean();
        const tokens = (user?.fcmTokens ?? []).map((t) => t.token).filter(Boolean);
        if (!tokens.length) return;

        const messaging = admin.messaging(this.firebaseApp);
        try {
            const res = await messaging.sendEachForMulticast({
                tokens,
                notification: { title: payload.title, body: payload.body },
                data: payload.data,
                android: { priority: 'high' },
                apns: {
                    payload: {
                        aps: {
                            sound: 'default',
                            'content-available': 1,
                        },
                    },
                },
            });
            if (res.failureCount > 0) {
                AppLogger.warn(`FCM partial failure: ${res.failureCount}/${tokens.length}`);
            }
        } catch (error) {
            AppLogger.error('FCM send failed:', error);
        }
    }
}
