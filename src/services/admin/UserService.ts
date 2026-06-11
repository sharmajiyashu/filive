import { Service } from 'typedi';
import User from '../../models/User';
import AgencyHost from '../../models/AgencyHost';

@Service()
export class UserService {
  public async getUsers(pagination: { page: number; limit: number }, filters: any) {
    const { page, limit } = pagination;
    const { search, city, state, role } = filters;

    const query: any = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } }
      ];

      const searchNumber = Number(search);
      if (!isNaN(searchNumber)) {
        query.$or.push({ userId: searchNumber });
      }
    }
    if (city) query['location.city'] = city;
    if (state) query['location.state'] = state;
    if (role) query.userRole = role;

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .populate('profileImage')
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    return {
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public async toggleCoinseller(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    user.isCoinseller = !user.isCoinseller;
    await user.save();
    return user;
  }

  public async setCoinsellerAndRemoveFromAgencies(userId: string, isCoinseller: boolean = true) {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');

    user.isCoinseller = isCoinseller;
    await user.save();

    const removedHosts = await AgencyHost.deleteMany({ userId: user._id });

    return {
      user,
      agencyHostsRemoved: removedHosts.deletedCount ?? 0,
    };
  }

  public async adjustCoinsellerCoins(userId: string, amount: number) {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    
    const currentVal = user.coinSellerCoins || 0;
    const newVal = currentVal + amount;
    
    if (newVal < 0) {
      throw new Error(`Insufficient coinseller coins. Resulting balance cannot be less than zero.`);
    }

    user.coinSellerCoins = newVal;
    await user.save();
    return user;
  }

  public async updateVideoVerificationStatus(userId: string, status: 'approved' | 'rejected') {
    const user = await User.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');
    
    user.videoVerificationStatus = status;
    // We could also set isVerified = true if approved, depending on business logic, but let's stick to the specific request.
    await user.save();
    return user;
  }
}
