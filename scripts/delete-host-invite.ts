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
  const Message = mongoose.connection.collection('messages');
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const user = await User.findOne({ _id: userObjectId });
  if (!user) {
    console.log('User not found');
    process.exit(1);
  }

  console.log('User:', { name: user.name, numericUserId: user.userId });

  const hostRecords = await AgencyHost.find({ userId: userObjectId }).toArray();
  console.log('AgencyHost records found:', hostRecords.length);
  for (const record of hostRecords) {
    console.log('  -', {
      id: record._id,
      status: record.status,
      requestedBy: record.requestedBy,
      agencyId: record.agencyId,
      messageId: record.messageId,
    });
  }

  const requestIds = hostRecords.map((r) => r._id.toString());
  const messageIds = hostRecords
    .map((r) => r.messageId)
    .filter(Boolean);

  let inviteMessagesDeleted = 0;
  if (requestIds.length > 0) {
    const inviteDelete = await Message.deleteMany({
      type: 'agency_host_invite',
      $or: [
        { 'metadata.agencyHostRequestId': { $in: requestIds } },
        ...(messageIds.length > 0 ? [{ _id: { $in: messageIds } }] : []),
      ],
    });
    inviteMessagesDeleted = inviteDelete.deletedCount;
  }

  const hostDelete = await AgencyHost.deleteMany({ userId: userObjectId });

  console.log('Invite messages deleted:', inviteMessagesDeleted);
  console.log('AgencyHost records deleted:', hostDelete.deletedCount);

  const remainingHosts = await AgencyHost.countDocuments({ userId: userObjectId });
  const remainingInvites = await Message.countDocuments({
    type: 'agency_host_invite',
    $or: [
      { senderId: userObjectId },
      { 'metadata.agencyHostRequestId': { $in: requestIds } },
    ],
    deletedAt: { $exists: false },
  });

  console.log('Remaining AgencyHost links:', remainingHosts);
  console.log('Remaining invite messages:', remainingInvites);

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
