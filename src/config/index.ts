import dotenv from 'dotenv';
import process from 'process';

const envFound = dotenv.config();
if (!envFound) throw new Error(' ⚠️ No Environment Variable File Found ⚠️ ');

export default {
    port: parseInt(process.env.PORT || '3000', 10),
    auth: {
        secret: process.env.JWT_SECRET || 'H53dLV$Uy?v9#6L',
        accessExpiry: '1h', // 1 hour
        refreshExpiry: '7d', // 7 days
        rememberExpiry: '30d' // 30 days for "Remember Me"
    },
    backend: {
        url: process.env.BACKEND_URL || ''
    },
    database: {
        mongo: {
            uri: process.env.MONGODB_URI || ''
        }
    },
    google: {
        mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
        clientId: process.env.GOOGLE_CLIENT_ID || ''
    },
    apple: {
        clientId: process.env.APPLE_CLIENT_ID || ''
    },
    facebook: {
        appId: process.env.FACEBOOK_APP_ID || '',
        appSecret: process.env.FACEBOOK_APP_SECRET || ''
    },
    microsoft: {
        tenantId: process.env.MICROSOFT_TENANT_ID || 'undefined',
        clientId: process.env.MICROSOFT_CLIENT_ID || 'undefined',
        clientSecretValue: process.env.MICROSOFT_CLIENT_SECRET_VALUE || 'undefined'
    },
    email: {
        authFrom: process.env.EMAIL_AUTH || '',
        smtp: {
            host: process.env.SMTP_HOST || '',
            port: parseInt(process.env.SMTP_PORT || '465', 10),
            secure: true, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASS || ''
            }
        }
    },
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
        apiKey: process.env.CLOUDINARY_API_KEY || '',
        apiSecret: process.env.CLOUDINARY_API_SECRET || ''
    },
    razorpay: {
        keyId: process.env.RAZORPAY_KEY_ID || '',
        keySecret: process.env.RAZORPAY_KEY_SECRET || ''
    },
    firebase: {
        /** Absolute or relative path to Firebase service account JSON file */
        serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
        /** Alternative: raw JSON string of the service account (for hosted envs) */
        serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || ''
    },
    digiverification: {
        baseUrl: process.env.DIGIVERIFICATION_BASE_URL || 'https://api.digiverification.com',
        partnerCode: process.env.DIGIVERIFICATION_PARTNER_CODE || 'ESP00116',
        tokenKey: process.env.DIGIVERIFICATION_TOKEN_KEY || '735c6e47fe346bdec8c9fead340e1f911b5fcf9f'
    }
};
