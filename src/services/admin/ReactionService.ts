import { Service, Inject } from 'typedi';
import mongoose from 'mongoose';
import Reaction, { IReaction } from '../../models/Reaction';
import { CloudinaryService } from '../common/CloudinaryService';
import { MediaService } from '../common/MediaService';

@Service()
export class ReactionService {
  constructor(
    @Inject() private cloudinaryService: CloudinaryService,
    @Inject() private mediaService: MediaService
  ) {}

  async createReaction(data: any, file?: any) {
    let gifUrl = data.gifUrl;
    let mediaId = data.mediaId;

    if (file) {
      const uploadResults = await this.cloudinaryService.uploadMedia('image' as any, [file], 'reactions');
      if (uploadResults.length > 0) {
        const media = await this.mediaService.createMedia({
          url: uploadResults[0].url,
          mimetype: uploadResults[0].mimetype || file.mimetype || 'image/gif',
          type: 'image',
          size: uploadResults[0].size || file.size,
          width: uploadResults[0].width,
          height: uploadResults[0].height,
        });
        mediaId = media._id;
        gifUrl = media.url;
      }
    }

    const code = (data.code || data.name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const reaction = await Reaction.create({
      name: data.name,
      code,
      emoji: data.emoji || '❤️',
      gifUrl,
      mediaId,
      category: data.category || 'animated_gif',
      sortOrder: data.sortOrder ? Number(data.sortOrder) : 0,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    });

    return await Reaction.findById(reaction._id).populate('mediaId');
  }

  async getAllReactions(params: { page?: number; limit?: number; search?: string; category?: string; isActive?: boolean }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 50));
    const skip = (page - 1) * limit;

    const query: any = {};
    if (params.search) {
      const searchRegex = new RegExp(params.search, 'i');
      query.$or = [{ name: searchRegex }, { code: searchRegex }, { emoji: searchRegex }];
    }
    if (params.category) {
      query.category = params.category;
    }
    if (params.isActive !== undefined) {
      query.isActive = params.isActive;
    }

    const total = await Reaction.countDocuments(query);
    const reactions = await Reaction.find(query)
      .populate('mediaId')
      .sort({ sortOrder: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return {
      reactions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getReactionById(id: string) {
    const reaction = await Reaction.findById(id).populate('mediaId');
    if (!reaction) {
      throw new Error('Reaction not found');
    }
    return reaction;
  }

  async updateReaction(id: string, data: any, file?: any) {
    const reaction = await Reaction.findById(id);
    if (!reaction) {
      throw new Error('Reaction not found');
    }

    let gifUrl = data.gifUrl || reaction.gifUrl;
    let mediaId = data.mediaId || reaction.mediaId;

    if (file) {
      const uploadResults = await this.cloudinaryService.uploadMedia('image' as any, [file], 'reactions');
      if (uploadResults.length > 0) {
        const media = await this.mediaService.createMedia({
          url: uploadResults[0].url,
          mimetype: uploadResults[0].mimetype || file.mimetype || 'image/gif',
          type: 'image',
          size: uploadResults[0].size || file.size,
          width: uploadResults[0].width,
          height: uploadResults[0].height,
        });
        mediaId = media._id;
        gifUrl = media.url;
      }
    }

    if (data.name) reaction.name = data.name;
    if (data.code) reaction.code = data.code.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (data.emoji !== undefined) reaction.emoji = data.emoji;
    if (data.category) reaction.category = data.category;
    if (data.sortOrder !== undefined) reaction.sortOrder = Number(data.sortOrder);
    if (data.isActive !== undefined) reaction.isActive = Boolean(data.isActive);
    reaction.gifUrl = gifUrl;
    reaction.mediaId = mediaId;

    await reaction.save();
    return await Reaction.findById(id).populate('mediaId');
  }

  async deleteReaction(id: string) {
    const reaction = await Reaction.findByIdAndDelete(id);
    if (!reaction) {
      throw new Error('Reaction not found');
    }
    return { success: true, message: 'Reaction deleted successfully' };
  }

  async seedReactions() {
    const defaultReactions = [
      { name: 'Heart Love', code: 'heart', emoji: '❤️', gifUrl: 'https://media.giphy.com/media/l41K3o5TzDQQD828E/giphy.gif', sortOrder: 1 },
      { name: 'Laughing Joy', code: 'laugh', emoji: '😂', gifUrl: 'https://media.giphy.com/media/10tIwj93qClO8w/giphy.gif', sortOrder: 2 },
      { name: 'Fire Hot', code: 'fire', emoji: '🔥', gifUrl: 'https://media.giphy.com/media/nrXif4Ytzy92w/giphy.gif', sortOrder: 3 },
      { name: 'Thumbs Up', code: 'thumbs_up', emoji: '👍', gifUrl: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif', sortOrder: 4 },
      { name: 'Angry Rage', code: 'angry', emoji: '😡', gifUrl: 'https://media.giphy.com/media/1tZ4j4BRXgzYXOKxs0/giphy.gif', sortOrder: 5 },
      { name: 'Crying Tears', code: 'cry', emoji: '😭', gifUrl: 'https://media.giphy.com/media/d22NqpjOcXZ8Q/giphy.gif', sortOrder: 6 },
      { name: 'Party Popper', code: 'party', emoji: '🎉', gifUrl: 'https://media.giphy.com/media/lszAB3TzFtjja/giphy.gif', sortOrder: 7 },
      { name: 'Cool Sunglasses', code: 'cool', emoji: '😎', gifUrl: 'https://media.giphy.com/media/COYGe9rZvfiaQ/giphy.gif', sortOrder: 8 },
      { name: 'Surprised Wow', code: 'surprised', emoji: '😮', gifUrl: 'https://media.giphy.com/media/51Upo5ybKoVYGtf2bU/giphy.gif', sortOrder: 9 },
      { name: 'Shining Star', code: 'star', emoji: '⭐', gifUrl: 'https://media.giphy.com/media/26n6WywJyh39n1pBu/giphy.gif', sortOrder: 10 },
      { name: 'Clapping Hands', code: 'clap', emoji: '👏', gifUrl: 'https://media.giphy.com/media/aLdiZXYBVKxpS/giphy.gif', sortOrder: 11 },
      { name: 'Blowing Kiss', code: 'kiss', emoji: '😘', gifUrl: 'https://media.giphy.com/media/3o7TKoWXm3okO1mcjC/giphy.gif', sortOrder: 12 },
      { name: 'Funny Poop', code: 'poop', emoji: '💩', gifUrl: 'https://media.giphy.com/media/26tP21k2e2l6K0gVi/giphy.gif', sortOrder: 13 },
      { name: 'Rocket Launch', code: 'rocket', emoji: '🚀', gifUrl: 'https://media.giphy.com/media/trJqE6T3f5t3g7c6qA/giphy.gif', sortOrder: 14 },
      { name: 'Golden Crown', code: 'crown', emoji: '👑', gifUrl: 'https://media.giphy.com/media/fVez1f8jM5cK6hN4k9/giphy.gif', sortOrder: 15 },
      { name: 'Mind Blown', code: 'mind_blown', emoji: '🤯', gifUrl: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif', sortOrder: 16 },
      { name: '100 Percent', code: 'hundred', emoji: '💯', gifUrl: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif', sortOrder: 17 },
      { name: 'Magic Sparkles', code: 'sparkles', emoji: '✨', gifUrl: 'https://media.giphy.com/media/3o7TKnO6yWcXZcegHV/giphy.gif', sortOrder: 18 },
      { name: 'Side Eyes', code: 'eyes', emoji: '👀', gifUrl: 'https://media.giphy.com/media/3oKIPkOgsHvh44DAs8/giphy.gif', sortOrder: 19 },
      { name: 'Warm Hug', code: 'hug', emoji: '🤗', gifUrl: 'https://media.giphy.com/media/3M4NpbLCTxBqU/giphy.gif', sortOrder: 20 },
    ];

    let createdCount = 0;
    for (const item of defaultReactions) {
      const exists = await Reaction.findOne({ code: item.code });
      if (!exists) {
        await Reaction.create({
          ...item,
          category: 'animated_gif',
          isActive: true,
        });
        createdCount++;
      }
    }

    return {
      message: `Seeded reactions successfully. Created ${createdCount} new reactions.`,
      totalSeeded: createdCount,
    };
  }
}
