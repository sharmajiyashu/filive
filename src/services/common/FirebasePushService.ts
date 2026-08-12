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

    private async sendToTokens(tokens: string[], payload: IChatPushPayload): Promise<void> {
        if (!this.firebaseApp || tokens.length === 0) return;

        const messaging = admin.messaging(this.firebaseApp);
        const chunkSize = 500;
        for (let i = 0; i < tokens.length; i += chunkSize) {
            const chunk = tokens.slice(i, i + chunkSize);
            try {
                const res = await messaging.sendEachForMulticast({
                    tokens: chunk,
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
                    AppLogger.warn(`FCM partial failure: ${res.failureCount}/${chunk.length}`);
                }
            } catch (error) {
                AppLogger.error('FCM send failed:', error);
            }
        }
    }

    public async notifyUser(userId: string, payload: IChatPushPayload): Promise<void> {
        if (!this.firebaseApp) {
            AppLogger.warn('FCM skipped: Firebase is not configured');
            return;
        }

        const user = await User.findById(userId).select('fcmTokens').lean();
        const tokens = (user?.fcmTokens ?? []).map((t) => t.token).filter(Boolean);
        if (!tokens.length) return;
        await this.sendToTokens(tokens, payload);
    }

    /** Notify specific user IDs, or all users when `userIds` is `'all'`. */
    public async notifyUsers(userIds: string[] | 'all', payload: IChatPushPayload): Promise<void> {
        if (!this.firebaseApp) {
            AppLogger.warn('FCM skipped: Firebase is not configured');
            return;
        }

        const query =
            userIds === 'all'
                ? { fcmTokens: { $exists: true, $ne: [] }, userRole: 'user' }
                : { _id: { $in: userIds }, fcmTokens: { $exists: true, $ne: [] } };

        const users = await User.find(query).select('fcmTokens').lean();
        const tokens = users
            .flatMap((u) => (u.fcmTokens ?? []).map((t) => t.token))
            .filter(Boolean);

        const uniqueTokens = Array.from(new Set(tokens));
        await this.sendToTokens(uniqueTokens, payload);
    }
}
