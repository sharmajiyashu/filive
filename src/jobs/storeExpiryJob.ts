import AppLogger from '../api/loaders/logger';
import { clearExpiredActiveStoreItems } from '../utils/activeStorePopulate';

const CHECK_INTERVAL_MS = 60 * 1000;

export function startStoreExpiryJob() {
  const run = async () => {
    try {
      const cleared = await clearExpiredActiveStoreItems();
      if (cleared > 0) {
        AppLogger.info(`Store expiry job: unequipped ${cleared} expired item(s)`);
      }
    } catch (err) {
      AppLogger.error('Store expiry job failed', err);
    }
  };

  run();
  setInterval(run, CHECK_INTERVAL_MS);
  AppLogger.info('Store expiry job started (checks every minute)');
}
