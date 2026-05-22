import fs from 'fs';
import path from 'path';
import Level from '../models/Level';
import AppLogger from '../api/loaders/logger';

function generateSVGForLevel(levelNumber: number, color: string, name: string): string {
  let secondaryColor = '#888888';
  if (levelNumber === 1) secondaryColor = '#8B4513';
  else if (levelNumber === 2) secondaryColor = '#708090';
  else if (levelNumber === 3) secondaryColor = '#FF8C00';
  else if (levelNumber === 4) secondaryColor = '#778899';
  else if (levelNumber === 5) secondaryColor = '#1E90FF';
  else if (levelNumber === 6) secondaryColor = '#006400';
  else if (levelNumber === 7) secondaryColor = '#8B0000';
  else if (levelNumber === 8) secondaryColor = '#00BFFF';
  else if (levelNumber === 9) secondaryColor = '#4B0082';
  else if (levelNumber === 10) secondaryColor = '#191970';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="grad${levelNumber}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${secondaryColor};stop-opacity:1" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
  </defs>
  <polygon points="50,5 90,25 90,75 50,95 10,75 10,25" fill="url(#grad${levelNumber})" filter="url(#shadow)"/>
  <polygon points="50,10 85,28 85,72 50,90 15,72 15,28" fill="none" stroke="#FFFFFF" stroke-width="2" opacity="0.8"/>
  ${levelNumber >= 5 ? `<polygon points="50,18 54,32 68,32 57,40 61,54 50,45 39,54 43,40 32,32 46,32" fill="#FFFFFF" opacity="0.9"/>` : ''}
  <text x="50" y="${levelNumber >= 5 ? '68' : '58'}" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="bold" fill="#FFFFFF" text-anchor="middle" filter="url(#shadow)">L${levelNumber}</text>
  <text x="50" y="${levelNumber >= 5 ? '82' : '78'}" font-family="system-ui, -apple-system, sans-serif" font-size="8" font-weight="600" fill="#FFFFFF" text-anchor="middle" opacity="0.9">${name.split(' ')[0].toUpperCase()}</text>
</svg>`;
  return svg;
}

export async function seedLevels() {
  try {
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'levels');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const levels = [
      {
        levelNumber: 1,
        name: 'Bronze Level',
        minCoins: 0,
        maxCoins: 5000,
        color: '#CD7F32',
        image: '/public/uploads/levels/level_1.svg',
      },
      {
        levelNumber: 2,
        name: 'Silver Level',
        minCoins: 5000,
        maxCoins: 10000,
        color: '#C0C0C0',
        image: '/public/uploads/levels/level_2.svg',
      },
      {
        levelNumber: 3,
        name: 'Gold Level',
        minCoins: 10000,
        maxCoins: 20000,
        color: '#FFD700',
        image: '/public/uploads/levels/level_3.svg',
      },
      {
        levelNumber: 4,
        name: 'Platinum Level',
        minCoins: 20000,
        maxCoins: 50000,
        color: '#E5E4E2',
        image: '/public/uploads/levels/level_4.svg',
      },
      {
        levelNumber: 5,
        name: 'Sapphire Level',
        minCoins: 50000,
        maxCoins: 100000,
        color: '#0F52BA',
        image: '/public/uploads/levels/level_5.svg',
      },
      {
        levelNumber: 6,
        name: 'Emerald Level',
        minCoins: 100000,
        maxCoins: 200000,
        color: '#50C878',
        image: '/public/uploads/levels/level_6.svg',
      },
      {
        levelNumber: 7,
        name: 'Ruby Level',
        minCoins: 200000,
        maxCoins: 500000,
        color: '#E0115F',
        image: '/public/uploads/levels/level_7.svg',
      },
      {
        levelNumber: 8,
        name: 'Diamond Level',
        minCoins: 500000,
        maxCoins: 1000000,
        color: '#B9F2FF',
        image: '/public/uploads/levels/level_8.svg',
      },
      {
        levelNumber: 9,
        name: 'Amethyst Level',
        minCoins: 1000000,
        maxCoins: 2000000,
        color: '#E6E6FA',
        image: '/public/uploads/levels/level_9.svg',
      },
      {
        levelNumber: 10,
        name: 'Obsidian Level',
        minCoins: 2000000,
        maxCoins: 10000000,
        color: '#00FFFF',
        image: '/public/uploads/levels/level_10.svg',
      },
    ];

    for (const lvl of levels) {
      // Generate SVG markup and write it to local disk
      const svgContent = generateSVGForLevel(lvl.levelNumber, lvl.color, lvl.name);
      const filePath = path.join(uploadDir, `level_${lvl.levelNumber}.svg`);
      fs.writeFileSync(filePath, svgContent);

      await Level.findOneAndUpdate(
        { levelNumber: lvl.levelNumber },
        lvl,
        { upsert: true, new: true }
      );
    }
    AppLogger.info('✅ Levels seeded successfully and level icons generated locally');
  } catch (error) {
    AppLogger.error('❌ Error seeding levels:', error);
  }
}
