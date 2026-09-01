import dotenv from 'dotenv';
import dns from 'node:dns';
import mongoose from 'mongoose';

dns.setDefaultResultOrder('ipv4first');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch {
  // ignore
}

dotenv.config();

const ACTIVE_STATUSES = ['initiated', 'accepted', 'busy'];

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('Error: MONGODB_URI not found in env variables');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.');

  const Call = mongoose.connection.collection('calls');
  const now = new Date();

  const before = await Call.aggregate([
    { $match: { status: { $in: ACTIVE_STATUSES } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]).toArray();

  console.log('Stuck / busy calls before cleanup:');
  if (before.length === 0) {
    console.log('  none');
  } else {
    for (const row of before) {
      console.log(`  ${row._id}: ${row.count}`);
    }
  }

  const initiated = await Call.updateMany(
    { status: 'initiated' },
    { $set: { status: 'missed', endedAt: now } }
  );

  const accepted = await Call.updateMany(
    { status: 'accepted' },
    { $set: { status: 'ended', endedAt: now } }
  );

  const busy = await Call.updateMany(
    { status: 'busy' },
    { $set: { status: 'ended', endedAt: now } }
  );

  const remaining = await Call.countDocuments({ status: { $in: ACTIVE_STATUSES } });

  console.log('Cleanup result:');
  console.log(`  initiated -> missed: ${initiated.modifiedCount}`);
  console.log(`  accepted  -> ended:  ${accepted.modifiedCount}`);
  console.log(`  busy      -> ended:  ${busy.modifiedCount}`);
  console.log(`  remaining active:    ${remaining}`);
  console.log('All users are now free for new calls.');

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

run().catch((error) => {
  console.error('Failed to complete busy calls:', error);
  process.exit(1);
});
