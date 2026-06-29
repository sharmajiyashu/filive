import { Service } from 'typedi';
import mongoose from 'mongoose';
import RoomTheme from '../../models/RoomTheme';
import AppLogger from '../../api/loaders/logger';

@Service()
export class RoomThemeService {
  constructor() {}

  // ----------------------------------------------------
  // ADMIN APIS
  // ----------------------------------------------------

  public async createTheme(data: {
    name: string;
    media: string;
  }) {
    AppLogger.info(`[RoomThemeService: createTheme] Creating room theme: ${data.name}`);
    return await RoomTheme.create({
      name: data.name,
      media: new mongoose.Types.ObjectId(data.media),
      isActive: true,
    });
  }

  public async updateTheme(id: string, data: any) {
    AppLogger.info(`[RoomThemeService: updateTheme] Updating room theme ID: ${id}`);
    if (data.media) {
      data.media = new mongoose.Types.ObjectId(data.media);
    }
    const theme = await RoomTheme.findByIdAndUpdate(id, data, { new: true });
    if (!theme) throw new Error('Room theme not found');
    return theme;
  }

  public async getAdminThemes(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const themes = await RoomTheme.find({})
      .populate('media')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await RoomTheme.countDocuments({});
    return {
      data: themes,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  public async deleteTheme(id: string) {
    AppLogger.info(`[RoomThemeService: deleteTheme] Deleting room theme ID: ${id}`);
    const theme = await RoomTheme.findByIdAndDelete(id);
    if (!theme) throw new Error('Room theme not found');
    return true;
  }

  // ----------------------------------------------------
  // APP APIS
  // ----------------------------------------------------

  public async getActiveThemes() {
    return await RoomTheme.find({ isActive: true }).populate('media').sort({ createdAt: -1 });
  }
}
