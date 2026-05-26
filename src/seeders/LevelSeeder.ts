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
  else if (levelNumber === 2) secondaryColor = type === 'rich' ? '#FF8C00' : '#FF1493';
  else if (levelNumber === 3) secondaryColor = type === 'rich' ? '#778899' : '#DB7093';
  else if (levelNumber === 4) secondaryColor = type === 'rich' ? '#1E90FF' : '#C71585';

  const prefix = type === 'rich' ? 'R' : 'C';
  const label = type === 'rich' ? 'RICH' : 'CHARM';

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
  <text x="50" y="55" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="bold" fill="#FFFFFF" text-anchor="middle" filter="url(#shadow)">${prefix}${levelNumber}</text>
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
      {
        levelNumber: 0,
        type: 'rich',
        name: 'Rich Level 0',
        minCoins: 0,
        maxCoins: 5000,
        color: '#CD7F32',
        image: '',
      },
      {
        levelNumber: 1,
        type: 'rich',
        name: 'Rich Level 1',
        minCoins: 5000,
        maxCoins: 20000,
        color: '#C0C0C0',
        image: '',
      },
      {
        levelNumber: 2,
        type: 'rich',
        name: 'Rich Level 2',
        minCoins: 20000,
        maxCoins: 40000,
        color: '#FFD700',
        image: '',
      },
      {
        levelNumber: 3,
        type: 'rich',
        name: 'Rich Level 3',
        minCoins: 40000,
        maxCoins: 60000,
        color: '#E5E4E2',
        image: '',
      },
      {
        levelNumber: 4,
        type: 'rich',
        name: 'Rich Level 4',
        minCoins: 60000,
        maxCoins: 82200,
        color: '#0F52BA',
        image: '',
      },
      // Charm Levels
      {
        levelNumber: 0,
        type: 'charm',
        name: 'Charm Level 0',
        minCoins: 0,
        maxCoins: 5000,
        color: '#FFB6C1',
        image: '',
      },
      {
        levelNumber: 1,
        type: 'charm',
        name: 'Charm Level 1',
        minCoins: 5000,
        maxCoins: 20000,
        color: '#FF69B4',
        image: '',
      },
      {
        levelNumber: 2,
        type: 'charm',
        name: 'Charm Level 2',
        minCoins: 20000,
        maxCoins: 40000,
        color: '#FF1493',
        image: '',
      },
      {
        levelNumber: 3,
        type: 'charm',
        name: 'Charm Level 3',
        minCoins: 40000,
        maxCoins: 60000,
        color: '#DB7093',
        image: '',
      },
      {
        levelNumber: 4,
        type: 'charm',
        name: 'Charm Level 4',
        minCoins: 60000,
        maxCoins: 82200,
        color: '#C71585',
        image: '',
      },
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
        }
      }

      const rangeTextVal = lvl.levelNumber === 0 ? '0' : `${Math.floor((lvl.levelNumber - 1) / 5) * 5 + 1}-${Math.floor((lvl.levelNumber - 1) / 5) * 5 + 5}`;

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
