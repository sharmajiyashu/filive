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

const userId = '69f47be40499f565aaeee18f';

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('Error: MONGODB_URI not found in env variables');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.');

  const User = mongoose.connection.collection('users');
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const user = await User.findOne({ _id: userObjectId });
  if (!user) {
    console.log(`User with ID ${userId} not found`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('Before update user details:', {
    _id: user._id,
    name: user.name,
    email: user.email,
    isPremium: user.isPremium,
    isPrime: user.isPrime,
  });

  const updateResult = await User.updateOne(
    { _id: userObjectId },
    { 
      $set: { 
        isPremium: true,
        isPrime: true 
      } 
    }
  );

  console.log('Update result:', updateResult);

  const updatedUser = await User.findOne({ _id: userObjectId });
  console.log('After update user details:', {
    _id: updatedUser?._id,
    name: updatedUser?.name,
    email: updatedUser?.email,
    isPremium: updatedUser?.isPremium,
    isPrime: updatedUser?.isPrime,
  });

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

run().catch((e) => {
  console.error('Error running script:', e);
  process.exit(1);
});
