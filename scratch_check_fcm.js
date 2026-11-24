const mongoose = require('mongoose');

(async () => {
  try {
    const uri = "mongodb://127.0.0.1:27017/filive";
    console.log('Connecting to:', uri);
    await mongoose.connect(uri);
    console.log('Connected to DB:', mongoose.connection.name);
    const user = await mongoose.connection.collection('users').findOne({ mobileNumber: /9079758684/ });
    if (!user) {
      console.log('User 9079758684 not found in users collection');
      const count = await mongoose.connection.collection('users').countDocuments({});
      console.log('Total users in db:', count);
    } else {
      console.log('Found user:', {
        _id: user._id,
        mobileNumber: user.mobileNumber,
        fullName: user.fullName || user.name,
        fcmTokens: user.fcmTokens,
        fcmToken: user.fcmToken,
        deviceType: user.deviceType,
        updatedAt: user.updatedAt
      });
    }

    const allWithTokens = await mongoose.connection.collection('users').find({
      $or: [
        { fcmTokens: { $exists: true, $ne: [] } },
        { fcmToken: { $exists: true, $ne: null } }
      ]
    }).toArray();
    console.log('Total users with tokens in DB:', allWithTokens.length);
    for (const u of allWithTokens) {
      console.log('User with token:', u.mobileNumber, 'tokens:', u.fcmTokens || u.fcmToken);
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await mongoose.disconnect();
  }
})();
