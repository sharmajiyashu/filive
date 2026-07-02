import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import dns from 'node:dns';

// Fix for ECONNREFUSED / DNS resolution issues in Node 18+ on some networks
dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  // Ignore if this fails
}

// Load environmental variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in .env');
  process.exit(1);
}

// Define inline Schema/Model to avoid type/import issues
const CallSchema = new mongoose.Schema(
  {
    status: { type: String }
  },
  { timestamps: true }
);

const Call = mongoose.model('Call', CallSchema);

async function run() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(MONGODB_URI as string);
    console.log('Connected successfully!');

    console.log('Resetting stuck calls...');
    const initiatedReset = await Call.updateMany(
      { status: 'initiated' },
      { $set: { status: 'missed', endedAt: new Date() } }
    );

    const acceptedReset = await Call.updateMany(
      { status: 'accepted' },
      { $set: { status: 'ended', endedAt: new Date() } }
    );

    console.log(`Cleaned up initiated calls: ${initiatedReset.modifiedCount} modified.`);
    console.log(`Cleaned up accepted calls: ${acceptedReset.modifiedCount} modified.`);
    console.log('Database cleanup completed!');
    process.exit(0);
  } catch (error: any) {
    console.error('Failed to cleanup calls:', error);
    process.exit(1);
  }
}

run();
