import { Service } from 'typedi';
import mongoose from 'mongoose';
import Game from '../../models/Game';
import AppLogger from '../../api/loaders/logger';

@Service()
export class GameService {
  constructor() { }

  // ----------------------------------------------------
  // ADMIN APIS
  // ----------------------------------------------------

  public async createGame(data: {
    name: string;
    link: string;
    minWinPercent: number;
    maxWinPercent: number;
    image?: string;
    isActive?: boolean;
  }) {
    AppLogger.info(`[GameService: createGame] Creating game: ${data.name}`);

    if (Number(data.minWinPercent) > Number(data.maxWinPercent)) {
      throw new Error('minWinPercent cannot be greater than maxWinPercent');
    }

    const gameData: any = {
      name: data.name,
      link: data.link,
      minWinPercent: Number(data.minWinPercent),
      maxWinPercent: Number(data.maxWinPercent),
      isActive: data.isActive !== undefined ? data.isActive : true,
    };

    if (data.image) {
      gameData.image = new mongoose.Types.ObjectId(data.image);
    }

    const game = await Game.create(gameData);
    return game.populate('image');
  }

  public async updateGame(id: string, data: any) {
    AppLogger.info(`[GameService: updateGame] Updating game ID: ${id}`);

    if (data.minWinPercent !== undefined && data.maxWinPercent !== undefined) {
      if (Number(data.minWinPercent) > Number(data.maxWinPercent)) {
        throw new Error('minWinPercent cannot be greater than maxWinPercent');
      }
    }

    if (data.image) {
      data.image = new mongoose.Types.ObjectId(data.image);
    }

    if (data.minWinPercent !== undefined) data.minWinPercent = Number(data.minWinPercent);
    if (data.maxWinPercent !== undefined) data.maxWinPercent = Number(data.maxWinPercent);

    const game = await Game.findByIdAndUpdate(id, data, { new: true }).populate('image');
    if (!game) throw new Error('Game not found');
    return game;
  }

  public async toggleStatus(id: string, isActive: boolean) {
    AppLogger.info(`[GameService: toggleStatus] Setting game ID: ${id} isActive=${isActive}`);
    const game = await Game.findByIdAndUpdate(id, { isActive }, { new: true }).populate('image');
    if (!game) throw new Error('Game not found');
    return game;
  }

  public async getAdminGames(page: number = 1, limit: number = 20, search?: string) {
    const skip = (page - 1) * limit;
    const query: any = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const [games, total] = await Promise.all([
      Game.find(query).populate('image').skip(skip).limit(limit).sort({ createdAt: -1 }),
      Game.countDocuments(query),
    ]);

    return {
      data: games,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  public async deleteGame(id: string) {
    AppLogger.info(`[GameService: deleteGame] Deleting game ID: ${id}`);
    const game = await Game.findByIdAndDelete(id);
    if (!game) throw new Error('Game not found');
    return true;
  }

  // ----------------------------------------------------
  // APP APIS
  // ----------------------------------------------------

  public async getActiveGames() {
    AppLogger.info(`[GameService: getActiveGames] Fetching active games`);
    return await Game.find({ isActive: true }).populate('image').sort({ createdAt: -1 });
  }

  public async getGameById(id: string) {
    return await Game.findById(id).populate('image');
  }
}
