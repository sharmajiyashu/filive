import axios from 'axios';
import Country, { ICountry } from '../../models/Country';
import AppLogger from '../../api/loaders/logger';

export interface KnownCountryInfo {
  name: string;
  code: string;
  currencyCode: string;
  currencySymbol: string;
  phoneCode: number;
  flag: string;
}

export const KNOWN_COUNTRIES: Record<string, KnownCountryInfo> = {
  IN: { name: 'India', code: 'IN', currencyCode: 'INR', currencySymbol: '₹', phoneCode: 91, flag: 'https://flagcdn.com/w160/in.png' },
  PK: { name: 'Pakistan', code: 'PK', currencyCode: 'PKR', currencySymbol: 'Rs', phoneCode: 92, flag: 'https://flagcdn.com/w160/pk.png' },
  BD: { name: 'Bangladesh', code: 'BD', currencyCode: 'BDT', currencySymbol: '৳', phoneCode: 880, flag: 'https://flagcdn.com/w160/bd.png' },
  AE: { name: 'United Arab Emirates', code: 'AE', currencyCode: 'AED', currencySymbol: 'AED', phoneCode: 971, flag: 'https://flagcdn.com/w160/ae.png' },
  US: { name: 'United States', code: 'US', currencyCode: 'USD', currencySymbol: '$', phoneCode: 1, flag: 'https://flagcdn.com/w160/us.png' },
  SA: { name: 'Saudi Arabia', code: 'SA', currencyCode: 'SAR', currencySymbol: '﷼', phoneCode: 966, flag: 'https://flagcdn.com/w160/sa.png' },
  AF: { name: 'Afghanistan', code: 'AF', currencyCode: 'AFN', currencySymbol: '؋', phoneCode: 93, flag: 'https://flagcdn.com/w160/af.png' },
  NP: { name: 'Nepal', code: 'NP', currencyCode: 'NPR', currencySymbol: 'रू', phoneCode: 977, flag: 'https://flagcdn.com/w160/np.png' },
  LK: { name: 'Sri Lanka', code: 'LK', currencyCode: 'LKR', currencySymbol: 'Rs', phoneCode: 94, flag: 'https://flagcdn.com/w160/lk.png' },
  GB: { name: 'United Kingdom', code: 'GB', currencyCode: 'GBP', currencySymbol: '£', phoneCode: 44, flag: 'https://flagcdn.com/w160/gb.png' },
  MY: { name: 'Malaysia', code: 'MY', currencyCode: 'MYR', currencySymbol: 'RM', phoneCode: 60, flag: 'https://flagcdn.com/w160/my.png' },
  ID: { name: 'Indonesia', code: 'ID', currencyCode: 'IDR', currencySymbol: 'Rp', phoneCode: 62, flag: 'https://flagcdn.com/w160/id.png' },
  PH: { name: 'Philippines', code: 'PH', currencyCode: 'PHP', currencySymbol: '₱', phoneCode: 63, flag: 'https://flagcdn.com/w160/ph.png' },
};

// Default realistic fallback rates if offline / API unreachable
export const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,
  INR: 85.5,
  PKR: 278.5,
  BDT: 119.5,
  AED: 3.67,
  SAR: 3.75,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.38,
  AUD: 1.53,
  SGD: 1.34,
  AFN: 72.0,
  NPR: 136.8,
  LKR: 295.0,
  KES: 129.0,
  NGN: 1450.0,
  PHP: 57.5,
  IDR: 15800.0,
  MYR: 4.45,
  THB: 35.5,
  JPY: 152.0,
  KRW: 1380.0,
  CNY: 7.24,
  TRY: 34.5,
  BRL: 5.45,
  EGP: 49.0,
  QAR: 3.64,
  KWD: 0.31,
  OMR: 0.38,
  BHD: 0.38,
};

// Currencies that should not have decimals (whole numbers)
const ZERO_DECIMAL_CURRENCIES = new Set([
  'INR', 'PKR', 'BDT', 'JPY', 'KRW', 'VND', 'IDR',
  'KES', 'UGX', 'UZS', 'NGN', 'NPR', 'LKR', 'AFN', 'MMK'
]);

export interface ConvertedPrice {
  usdPrice: number;
  localPrice: number;
  exchangeRate: number;
  currencyCode: string;
  currencySymbol: string;
  formattedText: string;
}

export class ExchangeRateService {
  private static instance: ExchangeRateService;
  private memoryCache: Map<string, number> = new Map();
  private lastFetchedAt: Date | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  public static getInstance(): ExchangeRateService {
    if (!ExchangeRateService.instance) {
      ExchangeRateService.instance = new ExchangeRateService();
    }
    return ExchangeRateService.instance;
  }

  constructor() {
    // Populate in-memory defaults
    for (const [curr, rate] of Object.entries(DEFAULT_EXCHANGE_RATES)) {
      this.memoryCache.set(curr.toUpperCase(), rate);
    }
  }

  /**
   * Start 24-hour background auto-refresh
   */
  public startAutoRefresh(): void {
    AppLogger.info('[ExchangeRateService] Initializing 24-hour exchange rate auto-refresh service...');
    // Seed default countries and initial exchange rates
    this.ensureDefaultCountries().catch(err => {
      AppLogger.warn(`[ExchangeRateService] ensureDefaultCountries failed: ${err?.message}`);
    });

    this.refreshRates().catch(err => {
      AppLogger.warn(`[ExchangeRateService] Initial exchange rate fetch failed: ${err?.message}`);
    });

    // 24 hours interval (86400000 ms)
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    this.refreshTimer = setInterval(() => {
      AppLogger.info('[ExchangeRateService] 24-Hour Timer Triggered: Refreshing global exchange rates...');
      this.refreshRates().catch(err => {
        AppLogger.error(`[ExchangeRateService] Daily exchange rate refresh error: ${err?.message}`);
      });
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Ensure standard countries exist in MongoDB Country collection
   */
  public async ensureDefaultCountries(): Promise<void> {
    try {
      for (const [code, info] of Object.entries(KNOWN_COUNTRIES)) {
        const existing = await Country.findOne({
          $or: [{ code }, { name: info.name }],
        });
        const currentRate = this.getRate(info.currencyCode);

        if (!existing) {
          await Country.create({
            name: info.name,
            code: info.code,
            phoneCode: info.phoneCode,
            countryCode: info.phoneCode,
            currencyCode: info.currencyCode,
            currencySymbol: info.currencySymbol,
            exchangeRate: currentRate,
            flag: info.flag,
            isActive: true,
          });
          AppLogger.info(`[ExchangeRateService] Seeded country ${info.name} (${info.code}) with rate ${currentRate}`);
        } else {
          let needsUpdate = false;
          if (!existing.currencyCode || existing.currencyCode !== info.currencyCode) {
            existing.currencyCode = info.currencyCode;
            needsUpdate = true;
          }
          if (!existing.currencySymbol || existing.currencySymbol !== info.currencySymbol) {
            existing.currencySymbol = info.currencySymbol;
            needsUpdate = true;
          }
          if (!existing.phoneCode && info.phoneCode) {
            existing.phoneCode = info.phoneCode;
            needsUpdate = true;
          }
          if (needsUpdate) {
            await existing.save();
          }
        }
      }
    } catch (err: any) {
      AppLogger.warn(`[ExchangeRateService] Failed to ensure default countries: ${err?.message}`);
    }
  }

  /**
   * Fetch live exchange rates from reliable open exchange rate API
   */
  public async refreshRates(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      AppLogger.info('[ExchangeRateService] Fetching latest USD exchange rates from external API...');
      let rates: Record<string, number> | null = null;

      // Primary source: open.er-api.com (No API key needed, real-time, high availability)
      try {
        const res = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 8000 });
        if (res.data && res.data.rates && typeof res.data.rates === 'object') {
          rates = res.data.rates;
        }
      } catch (err: any) {
        AppLogger.warn(`[ExchangeRateService] Primary exchange rate API failed: ${err.message}. Trying secondary...`);
      }

      // Secondary fallback source: api.exchangerate-api.com
      if (!rates) {
        try {
          const res = await axios.get('https://api.exchangerate-api.com/v4/latest/USD', { timeout: 8000 });
          if (res.data && res.data.rates && typeof res.data.rates === 'object') {
            rates = res.data.rates;
          }
        } catch (err: any) {
          AppLogger.warn(`[ExchangeRateService] Secondary exchange rate API failed: ${err.message}`);
        }
      }

      if (!rates) {
        AppLogger.warn('[ExchangeRateService] External rate APIs failed; keeping current cache and DB rates.');
        return { success: false, count: 0, error: 'External APIs unreachable' };
      }

      // Update in-memory cache
      for (const [curr, rate] of Object.entries(rates)) {
        if (typeof rate === 'number' && rate > 0) {
          this.memoryCache.set(curr.toUpperCase(), rate);
        }
      }
      this.lastFetchedAt = new Date();

      // Update Country records in MongoDB
      let updatedCount = 0;
      const countries = await Country.find({});
      for (const country of countries) {
        const curr = (country.currencyCode || '').trim().toUpperCase();
        if (curr && this.memoryCache.has(curr)) {
          const freshRate = Number(this.memoryCache.get(curr));
          if (freshRate > 0 && Math.abs(country.exchangeRate - freshRate) > 0.001) {
            country.exchangeRate = freshRate;
            await country.save();
            updatedCount++;
          }
        }
      }

      AppLogger.info(`[ExchangeRateService] Exchange rates successfully updated. ${updatedCount} country rates updated in DB.`);
      return { success: true, count: updatedCount };
    } catch (error: any) {
      AppLogger.error(`[ExchangeRateService] Failed to refresh exchange rates: ${error.message}`);
      return { success: false, count: 0, error: error.message };
    }
  }

  /**
   * Get exchange rate for a currency code (e.g. 'INR', 'PKR', 'AED', 'USD')
   */
  public getRate(currencyCode: string): number {
    const clean = (currencyCode || '').trim().toUpperCase();
    if (clean === 'USD' || !clean) return 1.0;
    if (this.memoryCache.has(clean)) {
      return Number(this.memoryCache.get(clean));
    }
    return DEFAULT_EXCHANGE_RATES[clean] || 1.0;
  }

  /**
   * Round price according to currency decimal rules:
   * - Currencies like INR, PKR, BDT, JPY: round to clean whole number (e.g. ₹5129, Rs 16707)
   * - Currencies like USD, EUR, GBP, AED: round to 2 decimal places (e.g. 220.16 AED, $59.99)
   */
  public roundLocalPrice(rawAmount: number, currencyCode: string): number {
    if (!rawAmount || isNaN(rawAmount) || rawAmount <= 0) return 0;
    const cleanCurr = (currencyCode || '').trim().toUpperCase();

    if (ZERO_DECIMAL_CURRENCIES.has(cleanCurr) || rawAmount >= 100) {
      return Math.round(rawAmount);
    }
    return Number(rawAmount.toFixed(2));
  }

  /**
   * Convert USD price to local currency with proper rounding
   */
  public convertPrice(
    usdPrice: number,
    targetCurrencyCode: string,
    targetCurrencySymbol: string = '$',
    customRate?: number
  ): ConvertedPrice {
    const numUsd = Number(usdPrice);
    const curr = (targetCurrencyCode || 'USD').trim().toUpperCase();
    const rate = (typeof customRate === 'number' && customRate > 0)
      ? customRate
      : this.getRate(curr);

    const rawLocal = numUsd * rate;
    const localPrice = this.roundLocalPrice(rawLocal, curr);

    const priceText = localPrice % 1 === 0 ? localPrice.toFixed(0) : localPrice.toFixed(2);
    const formattedText = `${targetCurrencySymbol}${priceText}`;

    return {
      usdPrice: numUsd,
      localPrice,
      exchangeRate: rate,
      currencyCode: curr,
      currencySymbol: targetCurrencySymbol,
      formattedText,
    };
  }

  /**
   * Resolve a Country object or fallback metadata given a query string, country code, or phone code
   */
  public async resolveCountry(queryOrCode?: string): Promise<{
    name: string;
    code: string;
    currencyCode: string;
    currencySymbol: string;
    exchangeRate: number;
    flag: string;
    phoneCode?: number;
  }> {
    const clean = (queryOrCode || '').toString().trim();
    if (!clean) {
      const inInfo = KNOWN_COUNTRIES.IN;
      return {
        ...inInfo,
        exchangeRate: this.getRate(inInfo.currencyCode),
      };
    }

    // Try MongoDB Country
    try {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(clean);
      let found = isObjectId ? await Country.findById(clean) : null;
      if (!found) {
        found = await Country.findOne({
          $or: [
            { code: clean.toUpperCase() },
            { name: new RegExp(`^${clean}$`, 'i') },
            { currencyCode: clean.toUpperCase() },
            { phoneCode: Number(clean.replace(/^\+/, '')) || -1 },
          ],
        });
      }
      if (found) {
        const rate = (Number(found.exchangeRate) > 0) ? Number(found.exchangeRate) : this.getRate(found.currencyCode);
        return {
          name: found.name,
          code: found.code,
          currencyCode: found.currencyCode,
          currencySymbol: found.currencySymbol,
          exchangeRate: rate,
          flag: found.flag,
          phoneCode: found.phoneCode,
        };
      }
    } catch {
      // Fall through to known map
    }

    // Check Known Countries
    const upper = clean.toUpperCase();
    if (KNOWN_COUNTRIES[upper]) {
      const k = KNOWN_COUNTRIES[upper];
      return {
        ...k,
        exchangeRate: this.getRate(k.currencyCode),
      };
    }

    // Check by name or phone
    for (const info of Object.values(KNOWN_COUNTRIES)) {
      if (
        info.name.toLowerCase() === clean.toLowerCase() ||
        info.currencyCode.toUpperCase() === upper ||
        String(info.phoneCode) === clean.replace(/^\+/, '')
      ) {
        return {
          ...info,
          exchangeRate: this.getRate(info.currencyCode),
        };
      }
    }

    // Default fallback to India
    const def = KNOWN_COUNTRIES.IN;
    return {
      ...def,
      exchangeRate: this.getRate(def.currencyCode),
    };
  }
}


export default ExchangeRateService.getInstance();
