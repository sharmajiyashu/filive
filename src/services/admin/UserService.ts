import { Service } from 'typedi';
import User from '../../models/User';

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
      ];
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
}
