import { Service } from 'typedi';
import PaymentMethod, {
  PaymentGatewayKey,
  PaymentTargetAudience,
} from '../../models/PaymentMethod';
import AppLogger from '../../api/loaders/logger';

const DEFAULT_METHODS = [
  {
    gateway: 'razorpay' as const,
    displayName: 'Razorpay',
    countries: ['IN'],
    targetAudience: 'all' as const,
    isActive: true,
  },
  {
    gateway: 'pandapay' as const,
    displayName: 'PandaPay',
    countries: ['IN'],
    targetAudience: 'all' as const,
    isActive: true,
  },
];

@Service()
export class PaymentMethodService {
  private async ensureDefaults() {
    for (const method of DEFAULT_METHODS) {
      await PaymentMethod.findOneAndUpdate(
        { gateway: method.gateway },
        { $setOnInsert: method },
        { upsert: true }
      );
    }
  }

  public async getAllPaymentMethods() {
    await this.ensureDefaults();
    return PaymentMethod.find().sort({ gateway: 1 });
  }

  public async getPaymentMethodByGateway(gateway: string) {
    const method = await PaymentMethod.findOne({ gateway });
    if (!method) throw new Error(`Payment method '${gateway}' not found`);
    return method;
  }

  public async updatePaymentMethod(
    gateway: string,
    data: {
      countries?: string[] | string;
      targetAudience?: PaymentTargetAudience;
      isActive?: boolean | string;
      displayName?: string;
    }
  ) {
    const allowed: PaymentGatewayKey[] = ['razorpay', 'pandapay'];
    if (!allowed.includes(gateway as PaymentGatewayKey)) {
      throw new Error('Invalid payment gateway. Allowed: razorpay, pandapay');
    }

    AppLogger.info(`[PaymentMethodService: updatePaymentMethod] Updating ${gateway}`);

    const update: Record<string, any> = {};

    if (data.displayName !== undefined) {
      update.displayName = String(data.displayName).trim();
    }

    if (data.targetAudience !== undefined) {
      const audience = String(data.targetAudience).toLowerCase();
      if (!['all', 'user', 'seller'].includes(audience)) {
        throw new Error("targetAudience must be 'all', 'user', or 'seller'");
      }
      update.targetAudience = audience;
    }

    if (data.isActive !== undefined) {
      update.isActive =
        typeof data.isActive === 'string'
          ? data.isActive === 'true' || data.isActive === '1'
          : Boolean(data.isActive);
    }

    if (data.countries !== undefined) {
      let countries: string[] = [];
      if (typeof data.countries === 'string') {
        try {
          const parsed = JSON.parse(data.countries);
          countries = Array.isArray(parsed)
            ? parsed.map((c) => String(c))
            : data.countries.split(',').map((c: string) => c.trim());
        } catch {
          countries = data.countries.split(',').map((c: string) => c.trim());
        }
      } else if (Array.isArray(data.countries)) {
        countries = data.countries.map((c) => String(c));
      } else {
        throw new Error('countries must be an array of ISO country codes');
      }
      update.countries = countries
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
      if (update.countries.length === 0) {
        throw new Error('At least one country code is required (or ALL)');
      }
    }

    const method = await PaymentMethod.findOneAndUpdate(
      { gateway },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (!method.displayName) {
      method.displayName = gateway === 'razorpay' ? 'Razorpay' : 'PandaPay';
      await method.save();
    }

    return method;
  }
}
