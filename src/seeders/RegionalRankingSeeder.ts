import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../models/User';
import Country from '../models/Country';
import CoinHistory from '../models/CoinHistory';
import AppLogger from '../api/loaders/logger';

export async function seedRegionalRankingUsers() {
  try {
    AppLogger.info('🌱 Seeding regional ranking test users...');

    const hashedPassword = await bcrypt.hash('User@123', 10);

    const testUserConfigs = [
      // India (IN)
      { name: 'Aarav Sharma', email: 'aarav.in@test.com', mobile: '919876543210', countryCode: 'IN', richGifts: 50000, charmGifts: 45000 },
      { name: 'Priya Patel', email: 'priya.in@test.com', mobile: '919876543211', countryCode: 'IN', richGifts: 35000, charmGifts: 38000 },
      { name: 'Rahul Verma', email: 'rahul.in@test.com', mobile: '919876543212', countryCode: 'IN', richGifts: 20000, charmGifts: 25000 },
      { name: 'Ananya Roy', email: 'ananya.in@test.com', mobile: '919876543213', countryCode: 'IN', richGifts: 12000, charmGifts: 18000 },
      
      // UAE (AE)
      { name: 'Zayd Al-Mansoor', email: 'zayd.ae@test.com', mobile: '971501234567', countryCode: 'AE', richGifts: 75000, charmGifts: 60000 },
      { name: 'Fatima Al-Zahra', email: 'fatima.ae@test.com', mobile: '971501234568', countryCode: 'AE', richGifts: 42000, charmGifts: 50000 },
      { name: 'Tariq Hassan', email: 'tariq.ae@test.com', mobile: '971501234569', countryCode: 'AE', richGifts: 28000, charmGifts: 31000 },

      // USA (US)
      { name: 'Alex Morgan', email: 'alex.us@test.com', mobile: '14155550123', countryCode: 'US', richGifts: 60000, charmGifts: 55000 },
      { name: 'Emily Davis', email: 'emily.us@test.com', mobile: '14155550124', countryCode: 'US', richGifts: 39000, charmGifts: 48000 },
      { name: 'Michael Brown', email: 'michael.us@test.com', mobile: '14155550125', countryCode: 'US', richGifts: 22000, charmGifts: 29000 },

      // Kenya (KE)
      { name: 'David Ochieng', email: 'david.ke@test.com', mobile: '254712345678', countryCode: 'KE', richGifts: 30000, charmGifts: 32000 },
      { name: 'Amina Mwangi', email: 'amina.ke@test.com', mobile: '254712345679', countryCode: 'KE', richGifts: 18000, charmGifts: 21000 },

      // UK (GB)
      { name: 'Oliver Smith', email: 'oliver.gb@test.com', mobile: '447700900077', countryCode: 'GB', richGifts: 48000, charmGifts: 42000 },
      { name: 'Sophie Taylor', email: 'sophie.gb@test.com', mobile: '447700900078', countryCode: 'GB', richGifts: 31000, charmGifts: 36000 },
    ];

    for (const item of testUserConfigs) {
      const countryDoc = await Country.findOne({ code: item.countryCode });
      
      let user = await User.findOne({
        $or: [{ email: item.email }, { mobile: item.mobile }]
      });
      if (!user) {
        user = new User({
          name: item.name,
          email: item.email,
          mobile: item.mobile,
          password: hashedPassword,
          userRole: 'user',
          country: item.countryCode,
          countryId: countryDoc?._id,
          coins: 10000,
          wealthCoins: item.richGifts,
          charmCoins: item.charmGifts,
          isVerified: true,
        });
        await user.save();
      } else {
        user.name = item.name;
        user.country = item.countryCode;
        if (countryDoc) user.countryId = countryDoc._id as mongoose.Types.ObjectId;
        user.wealthCoins = item.richGifts;
        user.charmCoins = item.charmGifts;
        await user.save();
      }

      // Add CoinHistory records for Rich ranking (type: gift_sent)
      const existingRichHistory = await CoinHistory.findOne({
        userId: user._id,
        type: 'gift_sent',
      });
      if (!existingRichHistory) {
        await CoinHistory.create({
          userId: user._id,
          amount: -item.richGifts,
          type: 'gift_sent',
          description: `Sent gift worth ${item.richGifts} coins`,
          createdAt: new Date(),
        });
      }

      // Add CoinHistory records for Charm ranking (type: gift_received)
      const existingCharmHistory = await CoinHistory.findOne({
        userId: user._id,
        type: 'gift_received',
      });
      if (!existingCharmHistory) {
        await CoinHistory.create({
          userId: user._id,
          amount: item.charmGifts,
          type: 'gift_received',
          description: `Received gift worth ${item.charmGifts} coins`,
          createdAt: new Date(),
        });
      }
    }

    AppLogger.info('✅ Regional ranking test users & coin histories seeded successfully!');
  } catch (error) {
    AppLogger.error('❌ Regional ranking seeder failed', error);
  }
}
