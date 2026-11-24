/**
 * FiLive FCM Push Notification Diagnostic & Test Script
 * 
 * Usage:
 *   node test_send_fcm.js [mobileNumber]
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
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

// Check server clock against Google's live server clock
function checkServerTimeSkew() {
  return new Promise((resolve) => {
    const req = https.request('https://www.google.com', { method: 'HEAD', timeout: 5000 }, (res) => {
      const serverDateStr = res.headers['date'];
      if (serverDateStr) {
        const googleTime = new Date(serverDateStr).getTime();
        const localTime = Date.now();
        const diffSeconds = Math.round((localTime - googleTime) / 1000);
        resolve({ googleTime: new Date(googleTime), localTime: new Date(localTime), diffSeconds });
      } else {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

(async () => {
  console.log('\n=============================================================');
  console.log(`  FiLive Push Notification Test Tool for: \x1b[33m${targetMobile}\x1b[0m`);
  console.log('=============================================================');

  // 1. Check Server Time
  log.section('1. Server Clock Verification (Critical for Google Auth)');
  const timeCheck = await checkServerTimeSkew();
  if (timeCheck) {
    console.log(` - Server Local Time:  ${timeCheck.localTime.toISOString()}`);
    console.log(` - Google Server Time: ${timeCheck.googleTime.toISOString()}`);
    console.log(` - Time Drift:         ${timeCheck.diffSeconds} seconds`);
    if (Math.abs(timeCheck.diffSeconds) > 60) {
      log.error(`SERVER CLOCK IS OUT OF SYNC by ${Math.abs(timeCheck.diffSeconds)} seconds!`);
      log.warn('>> Google will REJECT JWT signatures if time is skewed!');
      log.warn('>> Fix immediately on server by running:');
      console.log('   sudo timedatectl set-ntp true');
      console.log('   sudo systemctl restart systemd-timesyncd   # (or chrony)\n');
    } else {
      log.success('Server clock is synchronized with Google.');
    }
  } else {
    log.info(`Server time: ${new Date().toISOString()}`);
  }

  // 2. Check & Load Firebase Service Account
  log.section('2. Checking Firebase Service Account');
  let serviceAccount = null;
  const saPathCandidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    path.join(__dirname, 'firebase-service-account.json'),
    path.join(process.cwd(), 'firebase-service-account.json'),
    './firebase-service-account.json'
  ].filter(Boolean);

  let saFilePath = '';
  for (const candidate of saPathCandidates) {
    const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
    if (fs.existsSync(resolved)) {
      try {
        const raw = fs.readFileSync(resolved, 'utf8');
        serviceAccount = JSON.parse(raw);
        saFilePath = resolved;
        log.success(`Loaded Firebase service account from: ${resolved}`);
        log.info(`Project ID:      \x1b[32m${serviceAccount.project_id}\x1b[0m`);
        log.info(`Client Email:    ${serviceAccount.client_email}`);
        log.info(`Private Key ID:  ${serviceAccount.private_key_id}`);
        break;
      } catch (err) {
        log.error(`Failed parsing ${resolved}: ${err.message}`);
      }
    }
  }

  if (!serviceAccount) {
    log.error('Firebase Service Account file NOT found!');
    process.exit(1);
  }

  // Check private key formatting
  if (!serviceAccount.private_key || !serviceAccount.private_key.includes('BEGIN PRIVATE KEY')) {
    log.error('The "private_key" in firebase-service-account.json is malformed or missing!');
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

  // 3. Connect to MongoDB
  log.section('3. Connecting to MongoDB');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/filive';
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
    log.success(`Connected to DB: \x1b[32m${mongoose.connection.name}\x1b[0m`);
  } catch (err) {
    log.error(`MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }

  // 4. Find User & Tokens
  log.section(`4. Searching User with Mobile: ${targetMobile}`);
  const user = await mongoose.connection.collection('users').findOne({
    $or: [
      { mobileNumber: new RegExp(cleanDigits) },
      { mobile: new RegExp(cleanDigits) },
      { phone: new RegExp(cleanDigits) }
    ]
  });

  if (!user) {
    log.error(`User with mobile ${targetMobile} not found in DB!`);
    await mongoose.disconnect();
    process.exit(1);
  }

  log.success(`Found User: ${user.fullName || user.name || 'User'} (${user._id})`);

  let tokens = [];
  if (Array.isArray(user.fcmTokens) && user.fcmTokens.length > 0) {
    tokens = user.fcmTokens
      .map(t => (typeof t === 'string' ? t : t?.token))
      .filter(Boolean);
  }
  if (tokens.length === 0 && user.fcmToken) {
    tokens.push(user.fcmToken);
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
      console.log('=============================================================\x1b[0m\n');
      console.log('HOW TO FIX THIS ERROR:');
      console.log('1. If the error is "Invalid JWT Signature":');
      console.log('   - Check server clock: run "timedatectl set-ntp true" on server.');
      console.log('   - Or generate a fresh key in Firebase Console:');
      console.log('     Project Settings -> Service accounts -> "Generate new private key".');
      console.log('     Replace the contents of /var/www/filive/filive-backend/firebase-service-account.json with the new downloaded file.');
    }
  } catch (err) {
    log.error(`Firebase messaging error: ${err.message}`);
    console.error(err);
  } finally {
    await mongoose.disconnect();
    log.info('Disconnected from database. Done.');
  }
})();
