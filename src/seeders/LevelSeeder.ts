import fs from 'fs';
import path from 'path';
import Level from '../models/Level';
import Media from '../models/Media';
import AppLogger from '../api/loaders/logger';
import { v2 as cloudinary } from 'cloudinary';

function generateSVGForLevel(levelNumber: number, color: string, name: string, type: 'rich' | 'charm'): string {
  let secondaryColor = '#888888';
  if (levelNumber === 0) secondaryColor = type === 'rich' ? '#8B4513' : '#FFD1DC';
  else if (levelNumber === 1) secondaryColor = type === 'rich' ? '#708090' : '#FF69B4';
  else if (levelNumber <= 10) secondaryColor = type === 'rich' ? '#FF8C00' : '#FF1493';
  else if (levelNumber <= 20) secondaryColor = type === 'rich' ? '#778899' : '#DB7093';
  else if (levelNumber <= 30) secondaryColor = type === 'rich' ? '#1E90FF' : '#C71585';
  else if (levelNumber <= 50) secondaryColor = type === 'rich' ? '#9C27B0' : '#E91E63';
  else if (levelNumber <= 70) secondaryColor = type === 'rich' ? '#00BCD4' : '#FF4081';
  else secondaryColor = type === 'rich' ? '#FFD700' : '#FF0055';

  const prefix = type === 'rich' ? 'R' : 'C';
  const label = type === 'rich' ? 'RICH' : 'CHARM';
  const displayNum = levelNumber >= 100 ? '100' : `${levelNumber}`;

  // Hexagon polygon for rich levels, heart shape for charm levels
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="grad_${type}_${levelNumber}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${secondaryColor};stop-opacity:1" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
  </defs>
  ${type === 'rich'
      ? `<polygon points="50,5 90,25 90,75 50,95 10,75 10,25" fill="url(#grad_${type}_${levelNumber})" filter="url(#shadow)"/>`
      : `<path d="M12,30 A20,20 0 0,1 50,30 A20,20 0 0,1 88,30 Q88,60 50,90 Q12,60 12,30 Z" fill="url(#grad_${type}_${levelNumber})" filter="url(#shadow)"/>`
    }
  <text x="50" y="55" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="bold" fill="#FFFFFF" text-anchor="middle" filter="url(#shadow)">${prefix}${displayNum}</text>
  <text x="50" y="75" font-family="system-ui, -apple-system, sans-serif" font-size="8" font-weight="600" fill="#FFFFFF" text-anchor="middle" opacity="0.9">${label}</text>
</svg>`;
  return svg;
}

export async function seedLevels() {
  try {
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'levels');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Configure Cloudinary using process.env
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });

    const levels = [
      // Rich (Wealth) Levels
      { levelNumber: 0, type: 'rich', name: 'Rich Level 0', minCoins: 0, maxCoins: 5000, color: '#CD7F32', rangeText: '0', image: '' },
      { levelNumber: 1, type: 'rich', name: 'Rich Level 1-9', minCoins: 5000, maxCoins: 20000, color: '#FF4B8A', rangeText: '1-9', image: '' },
      { levelNumber: 10, type: 'rich', name: 'Rich Level 10-19', minCoins: 20000, maxCoins: 100000, color: '#6A85F1', rangeText: '10-19', image: '' },
      { levelNumber: 20, type: 'rich', name: 'Rich Level 20-29', minCoins: 100000, maxCoins: 300000, color: '#FFD700', rangeText: '20-29', image: '' },
      { levelNumber: 30, type: 'rich', name: 'Rich Level 30-39', minCoins: 300000, maxCoins: 700000, color: '#7C6FCD', rangeText: '30-39', image: '' },
      { levelNumber: 40, type: 'rich', name: 'Rich Level 40-49', minCoins: 700000, maxCoins: 1500000, color: '#E040FB', rangeText: '40-49', image: '' },
      { levelNumber: 50, type: 'rich', name: 'Rich Level 50-59', minCoins: 1500000, maxCoins: 3000000, color: '#FF5722', rangeText: '50-59', image: '' },
      { levelNumber: 60, type: 'rich', name: 'Rich Level 60-69', minCoins: 3000000, maxCoins: 6000000, color: '#00E676', rangeText: '60-69', image: '' },
      { levelNumber: 70, type: 'rich', name: 'Rich Level 70-79', minCoins: 6000000, maxCoins: 10000000, color: '#00B0FF', rangeText: '70-79', image: '' },
      { levelNumber: 80, type: 'rich', name: 'Rich Level 80-89', minCoins: 10000000, maxCoins: 16000000, color: '#651FFF', rangeText: '80-89', image: '' },
      { levelNumber: 90, type: 'rich', name: 'Rich Level 90-99', minCoins: 16000000, maxCoins: 25000000, color: '#FF1744', rangeText: '90-99', image: '' },
      { levelNumber: 100, type: 'rich', name: 'Rich Level 100', minCoins: 25000000, maxCoins: 50000000, color: '#FFD700', rangeText: '100', image: '' },

      // Charm Levels
      { levelNumber: 0, type: 'charm', name: 'Charm Level 0', minCoins: 0, maxCoins: 5000, color: '#FFB6C1', rangeText: '0', image: '' },
      { levelNumber: 1, type: 'charm', name: 'Charm Level 1-9', minCoins: 5000, maxCoins: 20000, color: '#FF4B8A', rangeText: '1-9', image: '' },
      { levelNumber: 10, type: 'charm', name: 'Charm Level 10-19', minCoins: 20000, maxCoins: 100000, color: '#6A85F1', rangeText: '10-19', image: '' },
      { levelNumber: 20, type: 'charm', name: 'Charm Level 20-29', minCoins: 100000, maxCoins: 300000, color: '#FFD700', rangeText: '20-29', image: '' },
      { levelNumber: 30, type: 'charm', name: 'Charm Level 30-39', minCoins: 300000, maxCoins: 700000, color: '#7C6FCD', rangeText: '30-39', image: '' },
      { levelNumber: 40, type: 'charm', name: 'Charm Level 40-49', minCoins: 700000, maxCoins: 1500000, color: '#E040FB', rangeText: '40-49', image: '' },
      { levelNumber: 50, type: 'charm', name: 'Charm Level 50-59', minCoins: 1500000, maxCoins: 3000000, color: '#FF5722', rangeText: '50-59', image: '' },
      { levelNumber: 60, type: 'charm', name: 'Charm Level 60-69', minCoins: 3000000, maxCoins: 6000000, color: '#00E676', rangeText: '60-69', image: '' },
      { levelNumber: 70, type: 'charm', name: 'Charm Level 70-79', minCoins: 6000000, maxCoins: 10000000, color: '#00B0FF', rangeText: '70-79', image: '' },
      { levelNumber: 80, type: 'charm', name: 'Charm Level 80-89', minCoins: 10000000, maxCoins: 16000000, color: '#651FFF', rangeText: '80-89', image: '' },
      { levelNumber: 90, type: 'charm', name: 'Charm Level 90-99', minCoins: 16000000, maxCoins: 25000000, color: '#FF1744', rangeText: '90-99', image: '' },
      { levelNumber: 100, type: 'charm', name: 'Charm Level 100', minCoins: 25000000, maxCoins: 50000000, color: '#FFD700', rangeText: '100', image: '' },
    ];

    // Clear old levels to avoid duplicate key errors on old unique indexes
    await Level.deleteMany({});

    for (const lvl of levels) {
      // Generate SVG markup and write it to local disk
      const svgContent = generateSVGForLevel(lvl.levelNumber, lvl.color, lvl.name, lvl.type as 'rich' | 'charm');
      const filename = `${lvl.type}_level_${lvl.levelNumber}.svg`;
      const filePath = path.join(uploadDir, filename);
      fs.writeFileSync(filePath, svgContent);

      let secureUrl = `/public/uploads/levels/${filename}`;

      // Upload to Cloudinary if credentials are configured
      if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        try {
          AppLogger.info(`Uploading level ${lvl.type} L${lvl.levelNumber} icon to Cloudinary...`);
          const uploadResult = await cloudinary.uploader.upload(filePath, {
            folder: 'levels',
            resource_type: 'auto'
          });
          secureUrl = uploadResult.secure_url;
        } catch (uploadErr) {
          AppLogger.error(`Error uploading to Cloudinary for ${filename}, falling back to local path:`, uploadErr);
          const appUrl = process.env.APP_URL || process.env.BACKEND_URL || 'http://localhost:3000';
          secureUrl = `${appUrl.replace(/\/$/, '')}/${secureUrl.replace(/^\//, '')}`;
        }
      } else {
        const appUrl = process.env.APP_URL || process.env.BACKEND_URL || 'http://localhost:3000';
        secureUrl = `${appUrl.replace(/\/$/, '')}/${secureUrl.replace(/^\//, '')}`;
      }

      const rangeTextVal = lvl.rangeText || (lvl.levelNumber === 0 ? '0' : (lvl.levelNumber >= 100 ? '100' : `${lvl.levelNumber}-${lvl.levelNumber + 9}`));

      // Create a Media record for this level icon
      const media = await Media.create({
        url: secureUrl,
        mimetype: 'image/svg+xml',
        type: 'image'
      });

      const levelData = {
        ...lvl,
        image: media._id,
        rangeText: rangeTextVal,
        levelRange: rangeTextVal
      };

      await Level.findOneAndUpdate(
        { levelNumber: lvl.levelNumber, type: lvl.type },
        levelData,
        { upsert: true, new: true }
      );
    }
    AppLogger.info('✅ Rich and Charm Levels seeded successfully');
  } catch (error) {
    AppLogger.error('❌ Error seeding levels:', error);
  }
}
