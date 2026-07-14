import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Room from './src/models/Room';
import dns from 'dns';

// Force Node.js to use Google's DNS to bypass local ISP DNS issues with SRV records
dns.setServers(['8.8.8.8', '8.8.4.4']);

dotenv.config();

async function run() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('No MONGODB_URI found in .env');
      process.exit(1);
    }
    await mongoose.connect(uri);
    console.log('Connected to DB');
    
    const result = await Room.updateMany(
      { status: 'live' },
      { $set: { status: 'ended', endedAt: new Date(), viewers: [], viewerCount: 0 } }
    );
    console.log('Update result:', result);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
