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

const userId = '69f4778b0499f565aaeee170';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || '');
  const User = mongoose.connection.collection('users');
  const AgencyHost = mongoose.connection.collection('agencyhosts');
  const Agency = mongoose.connection.collection('agencies');
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const user = await User.findOne({ _id: userObjectId });
  if (!user) {
    console.log('User not found');
    process.exit(1);
  }

  console.log('Before:', {
    name: user.name,
    numericUserId: user.userId,
    isCoinseller: user.isCoinseller,
  });

  await User.updateOne({ _id: userObjectId }, { $set: { isCoinseller: true } });

  const hostDelete = await AgencyHost.deleteMany({ userId: userObjectId });
  console.log('AgencyHost records removed:', hostDelete.deletedCount);

  const ownedAgencies = await Agency.find({ creatorId: userObjectId }).toArray();
  console.log(
    'Agencies owned (not deleted):',
    ownedAgencies.map((a) => ({ id: a._id, name: a.name }))
  );

  const userAfter = await User.findOne({ _id: userObjectId });
  console.log('After:', { isCoinseller: userAfter?.isCoinseller });

  const remainingHosts = await AgencyHost.countDocuments({ userId: userObjectId });
  console.log('Remaining AgencyHost links:', remainingHosts);

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
