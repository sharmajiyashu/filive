import { Service } from 'typedi';
import Agency from '../../models/Agency';

@Service()
export class AgencyService {
  public async getAgencies(pagination: { page: number; limit: number }, filters: { status?: string; search?: string }) {
    const { page, limit } = pagination;
    const { status, search } = filters;

    const query: any = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Agency.countDocuments(query);
    const agencies = await Agency.find(query)
      .populate('countryId')
      .populate('creatorId', 'name email profileImage userId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      agencies,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  public async getAgencyDetails(agencyId: string) {
    const agency = await Agency.findById(agencyId)
      .populate('countryId')
      .populate('creatorId', 'name email profileImage userId mobile');
    
    if (!agency) {
      throw new Error('Agency not found');
    }

    return agency;
  }

  public async updateAgencyStatus(agencyId: string, status: 'approved' | 'rejected') {
    const agency = await Agency.findById(agencyId);
    if (!agency) {
      throw new Error('Agency not found');
    }

    agency.status = status;
    await agency.save();

    return agency;
  }
}
