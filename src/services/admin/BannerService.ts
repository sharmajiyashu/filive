import { Service } from 'typedi';
import Banner, { BANNER_TYPES, BannerType } from '../../models/Banner';

function isBannerType(value: string | undefined): value is BannerType {
  return !!value && (BANNER_TYPES as readonly string[]).includes(value);
}

@Service()
export class BannerService {
  public async getSummary() {
    const [total, active, inactive, splash, home, gift, game] = await Promise.all([
      Banner.countDocuments({}),
      Banner.countDocuments({ isActive: true }),
      Banner.countDocuments({ isActive: false }),
      Banner.countDocuments({ type: 'splash' }),
      Banner.countDocuments({ type: 'home' }),
      Banner.countDocuments({ type: 'gift' }),
      Banner.countDocuments({ type: 'game' }),
    ]);

    return {
      totalBanners: total,
      activeBanners: active,
      inactiveBanners: inactive,
      splashBanners: splash,
      homeBanners: home,
      giftBanners: gift,
      gameBanners: game,
    };
  }

  public async list(params: {
    page?: number;
    limit?: number;
    type?: string;
    status?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 10));
    const skip = (page - 1) * limit;
    const query: Record<string, unknown> = {};

    if (isBannerType(params.type)) {
      query.type = params.type;
    }
    if (params.status === 'active') query.isActive = true;
    if (params.status === 'inactive') query.isActive = false;

    const [summary, total, banners] = await Promise.all([
      this.getSummary(),
      Banner.countDocuments(query),
      Banner.find(query)
        .populate('image')
        .sort({ sortOrder: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return {
      banners,
      summary,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  public async createMany(data: {
    type: string;
    imageIds: string[];
    redirectUrl?: string;
    route?: string;
  }) {
    if (!isBannerType(data.type)) {
      throw new Error('Invalid banner type');
    }
    if (!data.imageIds.length) {
      throw new Error('At least one banner image is required');
    }

    const last = await Banner.findOne({ type: data.type }).sort({ sortOrder: -1 }).select('sortOrder');
    let nextOrder = (last?.sortOrder || 0) + 1;

    const docs = data.imageIds.map((imageId) => ({
      type: data.type,
      image: imageId,
      redirectUrl: data.redirectUrl?.trim() || '',
      route: data.route?.trim() || '',
      isActive: true,
      sortOrder: nextOrder++,
    }));

    const created = await Banner.insertMany(docs);
    return Banner.find({ _id: { $in: created.map((item) => item._id) } }).populate('image');
  }

  public async update(
    id: string,
    data: {
      redirectUrl?: string;
      route?: string;
      isActive?: boolean;
      imageId?: string;
    }
  ) {
    const banner = await Banner.findById(id);
    if (!banner) throw new Error('Banner not found');

    if (data.redirectUrl !== undefined) banner.redirectUrl = data.redirectUrl.trim();
    if (data.route !== undefined) banner.route = data.route.trim();
    if (data.isActive !== undefined) banner.isActive = data.isActive;
    if (data.imageId) banner.image = data.imageId as any;

    await banner.save();
    return banner.populate('image');
  }

  public async toggleActive(id: string) {
    const banner = await Banner.findById(id);
    if (!banner) throw new Error('Banner not found');
    banner.isActive = !banner.isActive;
    await banner.save();
    return banner.populate('image');
  }

  public async remove(id: string) {
    const banner = await Banner.findByIdAndDelete(id);
    if (!banner) throw new Error('Banner not found');
    return banner;
  }

  public async listActiveByType(type?: string) {
    const query: Record<string, unknown> = { isActive: true };
    if (isBannerType(type)) query.type = type;

    return Banner.find(query)
      .populate('image')
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
  }
}
