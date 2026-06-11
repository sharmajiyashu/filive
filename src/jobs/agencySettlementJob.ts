import Container from 'typedi';
import AppLogger from '../api/loaders/logger';
import { AgencyCommissionService } from '../services/app/AgencyCommissionService';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function startAgencySettlementJob() {
  const commissionService = Container.get(AgencyCommissionService);

  const run = async () => {
    try {
      const result = await commissionService.runAutoSettlement();
      if (result.processed > 0) {
        AppLogger.info(`Agency auto-settlement: ${result.message}`);
      }
    } catch (err) {
      AppLogger.error('Agency auto-settlement job failed', err);
    }
  };

  run();
  setInterval(run, CHECK_INTERVAL_MS);
  AppLogger.info('Agency settlement job started (checks hourly, settles on Mondays)');
}
