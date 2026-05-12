import mongoose from 'mongoose';
import config from '../../config';
import AppLogger from './logger';

export default async (): Promise<typeof mongoose> => {
    if (!config.database.mongo.uri) {
        throw new Error('MONGODB_URI is not set in config');
    }

    try {
        const obfuscatedUri = config.database.mongo.uri.replace(/:([^@]+)@/, ':****@');
        AppLogger.info(`🔌 Attempting to connect to MongoDB: ${obfuscatedUri.split('@')[1] || 'Unknown Host'}`);

        const connection = await mongoose.connect(config.database.mongo.uri, {
            serverSelectionTimeoutMS: 10000, // Timeout after 10s
            socketTimeoutMS: 45000,
            heartbeatFrequencyMS: 10000,
            family: 4, // Force IPv4 to avoid ECONNREFUSED issues on Windows
        });

        AppLogger.info('✌️ MongoDB connected successfully');

        mongoose.connection.on('error', err => {
            AppLogger.error('❌ MongoDB runtime error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            AppLogger.warn('⚠️ MongoDB disconnected');
        });

        return connection;
    } catch (error) {
        AppLogger.error('❌ MongoDB Connection Failed:', {
            message: error.message,
            stack: error.stack
        });
        AppLogger.info('💡 TIP: If you see ECONNREFUSED, please ensure:');
        AppLogger.info('1. Your IP is whitelisted in MongoDB Atlas (Network Access -> 0.0.0.0/0 for testing).');
        AppLogger.info('2. Your database user has the correct permissions.');
        AppLogger.info('3. Your internet connection is not blocking port 27017.');
        throw error;
    }
};
