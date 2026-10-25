import { Service, Inject } from 'typedi';
import PaymentMethod, {
  PaymentGatewayKey,
  PaymentTargetAudience,
} from '../../models/PaymentMethod';
import User from '../../models/User';
import Country from '../../models/Country';
import { AppSettingService } from '../common/AppSettingService';

const GATEWAY_SETTING_KEYS: Record<PaymentGatewayKey, string> = {
  razorpay: 'payment_gateway_razorpay_enabled',
  cashfree: 'payment_gateway_cashfree_enabled',
  pandapay: 'payment_gateway_pandapay_enabled',
};

@Service()
export class PaymentMethodService {
  constructor(
    @Inject() private appSettingService: AppSettingService
  ) { }

  public async resolveUserCountryCode(userId?: string, countryCode?: string): Promise<string | undefined> {
    if (countryCode && countryCode.trim() !== '') {
      return countryCode.trim().toUpperCase();
    }
    if (!userId) return undefined;

    const user = await User.findById(userId).select('countryId');
    if (!user?.countryId) return undefined;

    const country = await Country.findById(user.countryId).select('code');
    return country?.code?.toUpperCase();
  }

  private async ensureDefaults() {
    const defaults = [
      {
        gateway: 'razorpay' as const,
        displayName: 'Razorpay (UPI, Cards, NetBanking)',
        countries: ['ALL', 'IN', '*'],
        targetAudience: 'all' as const,
        isActive: true,
        showInApp: true,
        showInWeb: true,
      },
      {
        gateway: 'cashfree' as const,
        displayName: 'Cashfree Payments (UPI, Cards, Wallets)',
        countries: ['ALL', 'IN', '*'],
        targetAudience: 'all' as const,
        isActive: true,
        showInApp: true,
        showInWeb: true,
      },
      {
        gateway: 'pandapay' as const,
        displayName: 'PandaPay',
        countries: ['ALL', 'IN', '*'],
        targetAudience: 'all' as const,
        isActive: false,
        showInApp: false,
        showInWeb: false,
      },
    ];
    for (const method of defaults) {
      const existing = await PaymentMethod.findOne({ gateway: method.gateway });
      if (!existing) {
        await PaymentMethod.create(method);
      } else {
        await PaymentMethod.updateOne(
          { gateway: method.gateway },
          {
            $addToSet: { countries: { $each: ['ALL', 'IN', '*'] } },
            $set: {
              showInApp: existing.showInApp ?? method.showInApp,
              showInWeb: existing.showInWeb ?? method.showInWeb,
            },
          }
        );
      }
    }
  }

  /**
   * Active payment methods, filtered by country + audience + platform (app/web) + AppSetting master switch.
   */
  public async getAvailablePaymentMethods(
    countryCode?: string,
    audience: 'user' | 'seller' | 'website' = 'user',
    platform: 'app' | 'web' = 'app'
  ) {
    await this.ensureDefaults();
    const code = countryCode?.trim().toUpperCase();
    const query: any = {
      isActive: true,
      targetAudience: { $in: ['all', audience, 'website'] },
    };

    if (platform === 'web') {
      query.showInWeb = { $ne: false };
    } else {
      query.showInApp = { $ne: false };
    }

    if (code) {
      query.countries = { $in: [code, 'ALL', '*'] };
    }

    let methods = await PaymentMethod.find(query).sort({ gateway: 1 });

    // Fallback if no methods specifically configured for this country code:
    // Platforms should show available active payment gateways (Razorpay/Cashfree)
    if (methods.length === 0) {
      methods = await PaymentMethod.find({
        isActive: true,
        ...(platform === 'web' ? { showInWeb: { $ne: false } } : { showInApp: { $ne: false } }),
      }).sort({ gateway: 1 });
    }

    const available = [];

    for (const method of methods) {
      const settingKey = GATEWAY_SETTING_KEYS[method.gateway as PaymentGatewayKey];
      const enabled = await this.appSettingService.getSettingValue(settingKey);
      if (enabled === false) continue;

      available.push({
        gateway: method.gateway,
        displayName: method.displayName,
        targetAudience: method.targetAudience,
        countries: method.countries,
        showInApp: method.showInApp !== false,
        showInWeb: method.showInWeb !== false,
      });
    }

    return available;
  }

  /**
   * Throws if gateway is not allowed for this user country + recharge audience + platform.
   */
  public async assertPaymentGatewayAllowed(
    userId: string,
    gateway: PaymentGatewayKey,
    audience: 'user' | 'seller' | 'website' = 'user',
    platform: 'app' | 'web' = 'app'
  ) {
    await this.ensureDefaults();

    const settingKey = GATEWAY_SETTING_KEYS[gateway];
    const enabled = await this.appSettingService.getSettingValue(settingKey);
    if (enabled === false) {
      throw new Error(`${gateway} payment gateway is currently disabled by administrator`);
    }

    const userCountry = await this.resolveUserCountryCode(userId);
    const countryCode = userCountry || 'IN';

    const method = await PaymentMethod.findOne({ gateway, isActive: true });
    if (!method) {
      throw new Error(`${gateway} payment method is not available`);
    }

    if (platform === 'web' && method.showInWeb === false) {
      throw new Error(`${method.displayName} is not enabled for web payments`);
    }

    if (platform === 'app' && method.showInApp === false) {
      throw new Error(`${method.displayName} is not enabled for mobile app payments`);
    }

    const audienceOk =
      method.targetAudience === 'all' ||
      method.targetAudience === audience ||
      (audience === 'website' && method.showInWeb !== false);
    if (!audienceOk) {
      throw new Error(
        `${method.displayName} is not available for ${audience} recharge in your region`
      );
    }

    const countries = (method.countries || []).map((c) => c.toUpperCase());
    const isAll = countries.length === 0 || countries.includes('ALL') || countries.includes('*');
    if (!isAll && !countries.includes(countryCode)) {
      if (method.gateway !== 'razorpay' && method.gateway !== 'cashfree') {
        if (platform !== 'web') {
          throw new Error(
            `${method.displayName} is not available in country ${countryCode}`
          );
        }
      }
    }

    return { countryCode, method };
  }

  public async assertPackageAllowedForAudience(
    packageAudience: PaymentTargetAudience | string | undefined,
    rechargeAudience: 'user' | 'seller' | 'website'
  ) {
    const pkgAudience = (packageAudience || 'all') as PaymentTargetAudience | string;
    if (pkgAudience === 'all') return;
    if (pkgAudience === 'website' && (rechargeAudience === 'website' || rechargeAudience === 'user')) {
      return;
    }
    if (pkgAudience !== rechargeAudience) {
      throw new Error(
        `This package is only available for ${pkgAudience} recharge, not ${rechargeAudience}`
      );
    }
  }
}
