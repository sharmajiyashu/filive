import { Service } from 'typedi';
import mongoose from 'mongoose';
import PayoutMethod, { IPayoutField } from '../../models/PayoutMethod';
import AppLogger from '../../api/loaders/logger';

@Service()
export class PayoutMethodService {
  /**
   * Create a new Payout Method (Admin)
   */
  public async createPayoutMethod(data: {
    name: string;
    media?: string;
    countries: string[];
    fields: IPayoutField[];
    minAmount?: number;
    maxAmount?: number;
    instructions?: string;
    isActive?: boolean;
  }) {
    AppLogger.info(`[PayoutMethodService: createPayoutMethod] Creating payout method: ${data.name}`);

    // Parse fields if received as JSON string from form-data
    let parsedFields = data.fields;
    if (typeof parsedFields === 'string') {
      try {
        parsedFields = JSON.parse(parsedFields);
      } catch (e) {
        parsedFields = [];
      }
    }

    // Parse countries if string
    let parsedCountries = data.countries;
    if (typeof parsedCountries === 'string') {
      try {
        parsedCountries = JSON.parse(parsedCountries);
      } catch (e) {
        parsedCountries = (data.countries as any).split(',').map((c: string) => c.trim().toUpperCase());
      }
    }
    if (Array.isArray(parsedCountries)) {
      parsedCountries = parsedCountries.map((c) => c.toUpperCase());
    }

    const payload: any = {
      name: data.name,
      countries: parsedCountries || [],
      fields: parsedFields || [],
      minAmount: data.minAmount !== undefined ? Number(data.minAmount) : 0,
      maxAmount: data.maxAmount !== undefined ? Number(data.maxAmount) : 100000,
      instructions: data.instructions || '',
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    };

    if (data.media && mongoose.Types.ObjectId.isValid(data.media)) {
      payload.media = new mongoose.Types.ObjectId(data.media);
    }

    return await PayoutMethod.create(payload);
  }

  /**
   * Update existing Payout Method (Admin)
   */
  public async updatePayoutMethod(id: string, data: any) {
    AppLogger.info(`[PayoutMethodService: updatePayoutMethod] Updating payout method ID: ${id}`);

    if (typeof data.fields === 'string') {
      try {
        data.fields = JSON.parse(data.fields);
      } catch (e) {}
    }

    if (typeof data.countries === 'string') {
      try {
        data.countries = JSON.parse(data.countries);
      } catch (e) {
        data.countries = data.countries.split(',').map((c: string) => c.trim().toUpperCase());
      }
    }
    if (Array.isArray(data.countries)) {
      data.countries = data.countries.map((c: string) => c.toUpperCase());
    }

    if (data.media && mongoose.Types.ObjectId.isValid(data.media)) {
      data.media = new mongoose.Types.ObjectId(data.media);
    }

    const method = await PayoutMethod.findByIdAndUpdate(id, data, { new: true }).populate('media');
    if (!method) throw new Error('Payout method not found');
    return method;
  }

  /**
   * Get all Payout Methods with pagination and search (Admin)
   */
  public async getAdminPayoutMethods(page: number = 1, limit: number = 20, search?: string) {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { countries: { $regex: search, $options: 'i' } },
      ];
    }

    const methods = await PayoutMethod.find(query)
      .populate('media')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await PayoutMethod.countDocuments(query);
    return {
      data: methods,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get Payout Method by ID
   */
  public async getPayoutMethodById(id: string) {
    const method = await PayoutMethod.findById(id).populate('media');
    if (!method) throw new Error('Payout method not found');
    return method;
  }

  /**
   * Delete Payout Method (Admin)
   */
  public async deletePayoutMethod(id: string) {
    AppLogger.info(`[PayoutMethodService: deletePayoutMethod] Deleting payout method ID: ${id}`);
    const method = await PayoutMethod.findByIdAndDelete(id);
    if (!method) throw new Error('Payout method not found');
    return true;
  }

  /**
   * Get active payout methods filtered by Country Code (App API)
   * Supports specific country code (e.g. IN, KH, US) or wildcard 'ALL'
   */
  public async getActivePayoutMethodsByCountry(countryCode?: string) {
    const query: any = { isActive: true };

    if (countryCode && countryCode.trim() !== '') {
      const code = countryCode.trim().toUpperCase();
      query.countries = { $in: [code, 'ALL', '*'] };
    }

    return await PayoutMethod.find(query).populate('media').sort({ name: 1 });
  }
}
