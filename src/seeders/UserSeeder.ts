import User from '../models/User';
import bcrypt from 'bcrypt';
import AppLogger from '../api/loaders/logger';

export async function seedUsers() {
    try {
        // Ensure static beans user with ID 2603904742 exists and has beans
        const staticUserId = 2603904742;
        const existingStaticUser = await User.findOne({ userId: staticUserId });
        if (existingStaticUser) {
            existingStaticUser.beans = 99999; // Set static beans data
            await existingStaticUser.save();
            AppLogger.info(`Updated static beans data for existing user: ${staticUserId}`);
        } else {
            const staticHashedPassword = await bcrypt.hash('User@123', 10);
            await User.create({
                userId: staticUserId,
                name: 'Static Beans User',
                email: 'staticbeans@example.com',
                mobile: '2603904742',
                password: staticHashedPassword,
                userRole: 'user',
                beans: 99999, // Static beans data
                coins: 10000,
                isVerified: true
            });
            AppLogger.info(`Created static beans user: ${staticUserId}`);
        }

        const usersCount = await User.countDocuments({ userRole: 'user' });

        if (usersCount > 0) {
            AppLogger.info('Users already seeded');
            return;
        }

        const hashedPassword = await bcrypt.hash('User@123', 10);

        const dummyUsers = [
            {
                name: 'John Doe',
                email: 'john@example.com',
                mobile: '1234567890',
                password: hashedPassword,
                userRole: 'user',
                location: {
                    lat: 40.7128,
                    lng: -74.0060,
                    address: '123 Broadway St',
                    city: 'New York',
                    state: 'NY',
                    zipcode: '10001'
                }
            },
            {
                name: 'Jane Smith',
                email: 'jane@example.com',
                mobile: '0987654321',
                password: hashedPassword,
                userRole: 'user',
                location: {
                    lat: 34.0522,
                    lng: -118.2437,
                    address: '456 Sunset Blvd',
                    city: 'Los Angeles',
                    state: 'CA',
                    zipcode: '90001'
                }
            }
        ];

        await User.create(dummyUsers);
        AppLogger.info('Dummy users seeded successfully');

    } catch (error) {
        AppLogger.error('User seeder failed', error);
    }
}
