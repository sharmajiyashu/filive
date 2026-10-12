export const CONSTANTS = {
    OTP_EXPIRY_MINUTES: 5,
    JWT_ACCESS_EXPIRY: '365d',
    JWT_ADMIN_ACCESS_EXPIRY: '12h',
    USER_ROLES: {
        ADMIN: 'admin',
        USER: 'user'
    }
} as const;
