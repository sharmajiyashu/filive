import ExchangeRateService from '../services/common/ExchangeRateService';
import AppLogger from '../api/loaders/logger';

export function startExchangeRateJob(): void {
  try {
    ExchangeRateService.startAutoRefresh();
    AppLogger.info('✌️ 24-Hour Exchange Rate Auto-Refresh Job Started');
  } catch (err: any) {
    AppLogger.error(`❌ Failed to start exchange rate job: ${err?.message}`);
  }
}
