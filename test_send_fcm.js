/**
 * FiLive FCM Push Notification Diagnostic & Test Script
 * 
 * Usage:
 *   node test_send_fcm.js [mobileNumber]
 * 
 * Example:
 *   node test_send_fcm.js 9079758684
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const admin = require('firebase-admin');

const targetMobile = process.argv[2] || '9079758684';
const cleanDigits = targetMobile.replace(/\D/g, '');

const log = {
  info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  success: (msg) => console.log(`\x1b[32m[SUCCESS] ✔\x1b[0m ${msg}`),
  warn: (msg) => console.log(`\x1b[33m[WARN] ⚠\x1b[0m ${msg}`),
  error: (msg) => console.log(`\x1b[31m[ERROR] ✖\x1b[0m ${msg}`),
  section: (title) => console.log(`\n\x1b[1m\x1b[35m=== ${title} ===\x1b[0m`),
};

(async () => {
  console.log('\n=============================================================');
  console.log(`  FiLive Push Notification Test Tool for: \x1b[33m${targetMobile}\x1b[0m`);
  console.log('=============================================================');

  // 1. Check & Load Firebase Service Account
  log.section('1. Checking Firebase Configuration');
  let serviceAccount = null;
  const saPathCandidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    path.join(__dirname, 'firebase-service-account.json'),
    path.join(process.cwd(), 'firebase-service-account.json'),
    './firebase-service-account.json'
  ].filter(Boolean);

  for (const candidate of saPathCandidates) {
    const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
    if (fs.existsSync(resolved)) {
      try {
        const raw = fs.readFileSync(resolved, 'utf8');
        serviceAccount = JSON.parse(raw);
        log.success(`Loaded Firebase service account from: ${resolved}`);
        log.info(`Firebase Project ID: \x1b[32m${serviceAccount.project_id || serviceAccount.projectId}\x1b[0m`);
        log.info(`Client Email: ${serviceAccount.client_email}`);
        break;
      } catch (err) {
        log.error(`Failed parsing ${resolved}: ${err.message}`);
      }
    }
  }

  if (!serviceAccount && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      log.success('Loaded Firebase service account from FIREBASE_SERVICE_ACCOUNT_JSON env var');
    } catch (err) {
      log.error(`Failed parsing FIREBASE_SERVICE_ACCOUNT_JSON: ${err.message}`);
    }
  }

  if (!serviceAccount) {
    log.error('Firebase Service Account file NOT found!');
    log.warn('Please make sure "firebase-service-account.json" exists in this directory or FIREBASE_SERVICE_ACCOUNT_PATH is set in .env');
    process.exit(1);
  }

  // Initialize Firebase Admin
  let firebaseApp;
  try {
    if (admin.apps.length > 0) {
      firebaseApp = admin.app();
    } else {
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    log.success('Firebase Admin SDK initialized successfully');
  } catch (err) {
    log.error(`Failed initializing Firebase Admin: ${err.message}`);
    process.exit(1);
  }

  // 2. Connect to MongoDB
  log.section('2. Connecting to MongoDB');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/filive';
  log.info(`Connecting to: ${mongoUri.replace(/:([^:@]{3,})@/, ':***@')}`);

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
    log.success(`Connected to DB: \x1b[32m${mongoose.connection.name}\x1b[0m on host: ${mongoose.connection.host}`);
  } catch (err) {
    log.error(`MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }

  // 3. Find User
  log.section(`3. Searching User with Mobile: ${targetMobile}`);
  const userQuery = {
    $or: [
      { mobileNumber: new RegExp(cleanDigits) },
      { mobile: new RegExp(cleanDigits) },
      { phone: new RegExp(cleanDigits) }
    ]
  };

  const user = await mongoose.connection.collection('users').findOne(userQuery);

  if (!user) {
    log.error(`User with mobile number matching "${cleanDigits}" was NOT found in collection "users"!`);
    
    // Check total users
    const totalUsers = await mongoose.connection.collection('users').countDocuments({});
    log.info(`Total users in database: ${totalUsers}`);
    
    // Show sample users
    const sample = await mongoose.connection.collection('users').find({}).limit(5).toArray();
    console.log('\nSample users in DB:');
    sample.forEach(u => console.log(` - ID: ${u._id} | Name: ${u.fullName || u.name || 'N/A'} | Mobile: ${u.mobileNumber || u.mobile || 'None'}`));
    
    await mongoose.disconnect();
    process.exit(1);
  }

  log.success(`Found User!`);
  console.log(` - User ID: \x1b[33m${user._id}\x1b[0m`);
  console.log(` - Name: ${user.fullName || user.name || 'N/A'}`);
  console.log(` - Mobile: ${user.mobileNumber || user.mobile || 'N/A'}`);
  console.log(` - Role: ${user.userRole || user.role || 'user'}`);
  console.log(` - Device Type: ${user.deviceType || 'unknown'}`);
  console.log(` - Last Login: ${user.lastLoginAt || user.updatedAt || 'N/A'}`);

  // 4. Extract FCM Tokens
  log.section('4. Checking User FCM Tokens');
  let tokens = [];

  if (Array.isArray(user.fcmTokens) && user.fcmTokens.length > 0) {
    tokens = user.fcmTokens
      .map(t => (typeof t === 'string' ? t : t?.token))
      .filter(Boolean);
  }

  if (tokens.length === 0 && user.fcmToken) {
    tokens.push(user.fcmToken);
  }

  if (tokens.length === 0) {
    log.error(`NO FCM tokens found for user ${user._id} (${user.mobileNumber})!`);
    log.warn('Why this happened:');
    console.log(' 1. The mobile app has not yet launched on this device with the updated NotificationService.');
    console.log(' 2. Or the user has not logged in yet from the app.');
    console.log(' 3. Or the POST /app/users/fcm-token API was not reachable from the app.');
    console.log('\n\x1b[1mAction needed:\x1b[0m Run "flutter run", log in with ' + cleanDigits + ', and verify that the app prints:');
    console.log(' "Registering FCM token with backend: <TOKEN>"');

    // Check if any other user has token in DB
    const usersWithTokens = await mongoose.connection.collection('users').find({
      $or: [
        { fcmTokens: { $exists: true, $ne: [] } },
        { fcmToken: { $exists: true, $ne: null } }
      ]
    }).limit(3).toArray();

    if (usersWithTokens.length > 0) {
      console.log('\nUsers who DO have registered tokens:');
      usersWithTokens.forEach(u => {
        const tCount = Array.isArray(u.fcmTokens) ? u.fcmTokens.length : 1;
        console.log(` - Mobile: ${u.mobileNumber || u.phone} | Tokens: ${tCount}`);
      });
    }

    await mongoose.disconnect();
    process.exit(1);
  }

  log.success(`Found ${tokens.length} registered FCM token(s):`);
  tokens.forEach((t, i) => console.log(` [${i + 1}] ${t.substring(0, 30)}...${t.substring(t.length - 15)}`));

  // 5. Send Test Notification
  log.section('5. Dispatching Test Push Notification via Firebase Cloud Messaging');
  const nowStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });

  const payload = {
    tokens: tokens,
    notification: {
      title: 'FiLive Test Notification 🚀',
      body: `Live notification test for ${targetMobile} at ${nowStr}. Everything is working!`
    },
    data: {
      type: 'test_notification',
      mobileNumber: String(cleanDigits),
      userId: String(user._id),
      sentAt: String(Date.now())
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'high_importance_channel',
        sound: 'default',
        priority: 'high',
        defaultSound: true,
        defaultVibrateTimings: true
      }
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          'content-available': 1
        }
      }
    }
  };

  try {
    const messaging = admin.messaging(firebaseApp);
    log.info(`Sending multicast payload to ${tokens.length} device(s)...`);
    const response = await messaging.sendEachForMulticast(payload);

    log.section('6. Notification Delivery Result');
    console.log(` - Total Sent:     ${response.responses.length}`);
    console.log(` - \x1b[32mSuccess Count:  ${response.successCount}\x1b[0m`);
    console.log(` - \x1b[31mFailure Count:  ${response.failureCount}\x1b[0m`);

    response.responses.forEach((resp, index) => {
      console.log(`\nToken #${index + 1}:`);
      if (resp.success) {
        log.success(`Message ID: ${resp.messageId}`);
      } else {
        log.error(`Error Code:    ${resp.error?.code}`);
        log.error(`Error Message: ${resp.error?.message}`);

        if (resp.error?.code === 'messaging/registration-token-not-registered') {
          log.warn('>> This token is EXPIRED or the app was uninstalled/reinstalled. Device must open app to get a new token.');
        } else if (resp.error?.code === 'messaging/invalid-registration-token') {
          log.warn('>> The token format is invalid.');
        } else if (resp.error?.code === 'messaging/mismatched-credential') {
          log.warn('>> The service account project does not match the app google-services.json project!');
        }
      }
    });

    if (response.successCount > 0) {
      console.log('\n\x1b[32m=============================================================');
      console.log('  ✔ PUSH NOTIFICATION SENT SUCCESSFULLY TO DEVICE!');
      console.log('  Check your phone screen / notification bar right now.');
      console.log('=============================================================\x1b[0m\n');
    } else {
      console.log('\n\x1b[31m=============================================================');
      console.log('  ✖ NOTIFICATION FAILED TO REACH DEVICE');
      console.log('  See error code details above.');
      console.log('=============================================================\x1b[0m\n');
    }
  } catch (err) {
    log.error(`Firebase messaging error: ${err.message}`);
    console.error(err);
  } finally {
    await mongoose.disconnect();
    log.info('Disconnected from database. Done.');
  }
})();
