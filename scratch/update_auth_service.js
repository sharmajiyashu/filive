const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'services', 'common', 'AuthenticationService.ts');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update userRegister
const oldRegister = `    async userRegister(data: {
        name: string;
        email: string;
        mobile: string;
        password?: string;
        location?: {
            lat?: number;
            lng?: number;
            address?: string;
            city?: string;
            state?: string;
            zipcode?: string;
        }
    }): Promise<{ token: string; user: IUser }> {
        const existingUser = await User.findOne({
            $or: [{ email: data.email }, { mobile: data.mobile }]
        });

        if (existingUser) {
            throw new Error('User with this email or mobile already exists');
        }

        const hashedPassword = data.password ? await bcrypt.hash(data.password, 10) : undefined;

        const user = await User.create({
            ...data,
            password: hashedPassword,
            userRole: 'user',
            authProvider: 'email',
        });

        // Send OTP via email
        const otp = this.generateOTP();
        const otpExpires = addMinutes(new Date(), CONSTANTS.OTP_EXPIRY_MINUTES);
        user.otp = otp;
        user.otpExpires = otpExpires;
        await user.save();

        try {
            await this.emailService.sendAuthOtpEmail({
                to: data.email,
                secret: otp,
                purpose: 'EMAIL_VERIFICATION'
            });
        } catch (error) {
            AppLogger.error(\`Failed to send verification email to \${data.email}: \${error}\`);
        }

        await user.populate('profileImage');

        const followersCount = await Follow.countDocuments({ followingId: user._id, status: 'accepted' });
        const followingCount = await Follow.countDocuments({ followerId: user._id, status: 'accepted' });

        return {
            token: '',
            user: {
                ...user.toObject(),
                followersCount,
                followingCount
            } as any
        }; // Return empty token, must verify first
    }`;

const newRegister = `    async userRegister(data: {
        name: string;
        email?: string;
        mobile?: string;
        password?: string;
        gender?: 'Male' | 'Female' | 'Other';
        dob?: Date | string;
        appType?: 'filive' | 'fivo';
        referredBy?: string;
        deviceId?: string;
        deviceModel?: string;
        location?: {
            lat?: number;
            lng?: number;
            address?: string;
            city?: string;
            state?: string;
            zipcode?: string;
        }
    }): Promise<{ token: string; user: IUser; isNewUser: boolean }> {
        if (!data.email && !data.mobile) {
            throw new Error('Email or mobile number is required');
        }
        const conds: any[] = [];
        if (data.email && data.email.trim()) conds.push({ email: data.email.toLowerCase().trim() });
        if (data.mobile && data.mobile.trim()) conds.push({ mobile: data.mobile.trim() });

        if (conds.length > 0) {
            const existingUser = await User.findOne({ $or: conds });
            if (existingUser) {
                throw new Error('User with this email or mobile already exists');
            }
        }

        if (data.deviceId) {
            await this.assertDeviceNotBanned(data.deviceId);
        }

        const hashedPassword = data.password ? await bcrypt.hash(data.password, 10) : undefined;
        const appType: 'filive' | 'fivo' = data.appType === 'fivo' ? 'fivo' : 'filive';

        let referrerObjId: mongoose.Types.ObjectId | undefined = undefined;
        if (data.referredBy && data.referredBy.trim() !== '') {
            const refStr = data.referredBy.trim();
            let referrerUser = null;
            if (mongoose.Types.ObjectId.isValid(refStr)) {
                referrerUser = await User.findById(refStr);
            }
            if (!referrerUser) {
                const searchNum = Number(refStr);
                const searchConds: any[] = [{ referralCode: refStr }, { referCode: refStr }];
                if (!isNaN(searchNum)) searchConds.push({ userId: searchNum });
                referrerUser = await User.findOne({ $or: searchConds });
            }
            if (referrerUser) {
                referrerObjId = referrerUser._id;
            }
        }

        const user = await User.create({
            name: data.name,
            email: data.email ? data.email.toLowerCase().trim() : undefined,
            mobile: data.mobile ? data.mobile.trim() : undefined,
            gender: data.gender,
            dob: data.dob ? new Date(data.dob) : undefined,
            password: hashedPassword,
            userRole: 'user',
            authProvider: data.email ? 'email' : 'phone',
            registerIn: appType,
            loginIn: appType,
            appType: appType,
            deviceId: data.deviceId,
            deviceModel: data.deviceModel,
            location: data.location,
            referredBy: referrerObjId,
            lastLoginAt: new Date(),
        });

        const { referralCode } = await ensureUserReferralCode(user);
        const token = this.generateToken(user._id.toString(), user.userRole);

        const followersCount = await Follow.countDocuments({ followingId: user._id, status: 'accepted' });
        const followingCount = await Follow.countDocuments({ followerId: user._id, status: 'accepted' });

        return {
            token,
            isNewUser: true,
            user: {
                ...user.toObject(),
                referralCode,
                followersCount,
                followingCount
            } as any
        };
    }`;

// 2. Update userLogin
const oldLogin = `    async userLogin(email: string, password: string): Promise<{ token: string; user: IUser; isPendingDeletion?: boolean; deletionDetails?: any }> {
        const user = await User.findOne({
            email,
            userRole: 'user'
        }).populate('profileImage');

        if (!user || !user.password) {
            throw new Error('Invalid email or password');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            throw new Error('Invalid email or password');
        }

        await this.assertUserNotBlocked(user);
        const deletionStatus = this.checkAndHandleDeletedAccount(user);

        const token = this.generateToken(user._id.toString(), user.userRole);

        // Update last login
        user.lastLoginAt = new Date();
        await user.save();

        const followersCount = await Follow.countDocuments({ followingId: user._id, status: 'accepted' });
        const followingCount = await Follow.countDocuments({ followerId: user._id, status: 'accepted' });

        return {
            token,
            isPendingDeletion: deletionStatus.isPendingDeletion,
            deletionDetails: deletionStatus,
            user: {
                ...user.toObject(),
                isDeleted: user.isDeleted,
                deletionReason: user.deletionReason,
                deletionDetails: deletionStatus,
                followersCount,
                followingCount
            } as any
        };
    }`;

const newLogin = `    async userLogin(
        identifier: string,
        password: string,
        appType: 'filive' | 'fivo' = 'filive',
        deviceId?: string,
        deviceModel?: string
    ): Promise<{ token: string; user: IUser; isPendingDeletion?: boolean; deletionDetails?: any }> {
        const cleanIdent = (identifier || '').trim();
        const user = await User.findOne({
            userRole: 'user',
            $or: [
                { email: cleanIdent.toLowerCase() },
                { mobile: cleanIdent }
            ]
        }).populate('profileImage').populate('countryId');

        if (!user || !user.password) {
            throw new Error('Invalid email/mobile or password');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            throw new Error('Invalid email/mobile or password');
        }

        if (deviceId) {
            await this.assertDeviceNotBanned(deviceId);
            user.deviceId = deviceId;
        }
        if (deviceModel) {
            user.deviceModel = deviceModel;
        }

        await this.assertUserNotBlocked(user, deviceId);
        const deletionStatus = this.checkAndHandleDeletedAccount(user);

        if (!user.registerIn) {
            user.registerIn = appType;
        }
        user.loginIn = appType;
        user.appType = appType;
        user.lastLoginAt = new Date();
        await user.save();

        const token = this.generateToken(user._id.toString(), user.userRole);

        const followersCount = await Follow.countDocuments({ followingId: user._id, status: 'accepted' });
        const followingCount = await Follow.countDocuments({ followerId: user._id, status: 'accepted' });
        const { referralCode } = await ensureUserReferralCode(user);

        const userObj: any = user.toObject();
        if (typeof userObj.beans === 'number') userObj.beans = Math.round(userObj.beans);
        if (typeof userObj.coins === 'number') userObj.coins = Math.round(userObj.coins);

        return {
            token,
            isPendingDeletion: deletionStatus.isPendingDeletion,
            deletionDetails: deletionStatus,
            user: {
                ...userObj,
                isDeleted: user.isDeleted,
                deletionReason: user.deletionReason,
                deletionDetails: deletionStatus,
                referralCode,
                followersCount,
                followingCount
            } as any
        };
    }`;

// Helper for normalize
function normalize(str) {
    return str.replace(/\r\n/g, '\n');
}

let normContent = normalize(content);

if (normContent.includes(normalize(oldRegister))) {
    normContent = normContent.replace(normalize(oldRegister), normalize(newRegister));
    console.log('userRegister replaced successfully');
} else {
    console.error('oldRegister not found!');
}

if (normContent.includes(normalize(oldLogin))) {
    normContent = normContent.replace(normalize(oldLogin), normalize(newLogin));
    console.log('userLogin replaced successfully');
} else {
    console.error('oldLogin not found!');
}

// 3. Update userSendOTP signature and body
const oldSendOtpSig = `    async userSendOTP(
        mobile: string,
        countryId?: string,
        referredBy?: string,
        extras?: { countryCode?: string; extension?: string; ipCountry?: string; deviceId?: string; deviceModel?: string }
    ): Promise<{ otp: string }> {`;

const newSendOtpSig = `    async userSendOTP(
        mobile: string,
        countryId?: string,
        referredBy?: string,
        extras?: { countryCode?: string; extension?: string; ipCountry?: string; deviceId?: string; deviceModel?: string; appType?: 'filive' | 'fivo' }
    ): Promise<{ otp: string }> {`;

if (normContent.includes(normalize(oldSendOtpSig))) {
    normContent = normContent.replace(normalize(oldSendOtpSig), normalize(newSendOtpSig));
    console.log('userSendOTP signature replaced successfully');
} else {
    console.error('oldSendOtpSig not found');
}

const oldSendOtpCreate = `            // Register new user with this mobile
            user = await User.create({
                name: 'User',
                mobile,
                otp,
                otpExpires,
                userRole: 'user',
                authProvider: 'phone',
                deviceId: extras?.deviceId,
                deviceModel: extras?.deviceModel,
                countryId: resolvedCountry?.countryId,
                country: resolvedCountry?.country || fallbackCode,
                countryCode: fallbackCode,
                referredBy: referrerObjId
            });`;

const newSendOtpCreate = `            const appType: 'filive' | 'fivo' = extras?.appType === 'fivo' ? 'fivo' : 'filive';
            // Register new user with this mobile
            user = await User.create({
                name: 'User',
                mobile,
                otp,
                otpExpires,
                userRole: 'user',
                authProvider: 'phone',
                deviceId: extras?.deviceId,
                deviceModel: extras?.deviceModel,
                countryId: resolvedCountry?.countryId,
                country: resolvedCountry?.country || fallbackCode,
                countryCode: fallbackCode,
                referredBy: referrerObjId,
                registerIn: appType,
                loginIn: appType,
                appType: appType,
            });`;

if (normContent.includes(normalize(oldSendOtpCreate))) {
    normContent = normContent.replace(normalize(oldSendOtpCreate), normalize(newSendOtpCreate));
    console.log('userSendOTP User.create replaced successfully');
} else {
    console.error('oldSendOtpCreate not found');
}

const oldSendOtpUpdate = `            if (!user.authProvider) {
                user.authProvider = 'phone';
            }
            await user.save();`;

const newSendOtpUpdate = `            if (!user.authProvider) {
                user.authProvider = 'phone';
            }
            if (extras?.appType) {
                user.loginIn = extras.appType;
                user.appType = extras.appType;
                if (!user.registerIn) {
                    user.registerIn = extras.appType;
                }
            }
            await user.save();`;

if (normContent.includes(normalize(oldSendOtpUpdate))) {
    normContent = normContent.replace(normalize(oldSendOtpUpdate), normalize(newSendOtpUpdate));
    console.log('userSendOTP User update replaced successfully');
} else {
    console.error('oldSendOtpUpdate not found');
}

// 4. Update userVerifyOTP
const oldVerifySig = `    async userVerifyOTP(
        mobile: string,
        otp: string,
        deviceId?: string,
        deviceModel?: string
    ): Promise<{ token: string; user: IUser; isNewUser: boolean; isPendingDeletion?: boolean; deletionDetails?: any }> {`;

const newVerifySig = `    async userVerifyOTP(
        mobile: string,
        otp: string,
        deviceId?: string,
        deviceModel?: string,
        appType: 'filive' | 'fivo' = 'filive'
    ): Promise<{ token: string; user: IUser; isNewUser: boolean; isPendingDeletion?: boolean; deletionDetails?: any }> {`;

if (normContent.includes(normalize(oldVerifySig))) {
    normContent = normContent.replace(normalize(oldVerifySig), normalize(newVerifySig));
    console.log('userVerifyOTP signature replaced successfully');
} else {
    console.error('oldVerifySig not found');
}

const oldVerifySave = `        if (deviceModel) {
            user.deviceModel = deviceModel;
        }
        await user.save();`;

const newVerifySave = `        if (deviceModel) {
            user.deviceModel = deviceModel;
        }
        if (!user.registerIn) {
            user.registerIn = appType;
        }
        user.loginIn = appType;
        user.appType = appType;
        await user.save();`;

if (normContent.includes(normalize(oldVerifySave))) {
    normContent = normContent.replace(normalize(oldVerifySave), normalize(newVerifySave));
    console.log('userVerifyOTP save replaced successfully');
} else {
    console.error('oldVerifySave not found');
}

// 5. Update googleAuth
const oldGooglePayload = `    async googleAuth(payload: {
        idToken?: string;
        accessToken?: string;
        email?: string;
        name?: string;
        googleId?: string;
        photoUrl?: string;
        countryId?: string;
        countryCode?: string;
        referredBy?: string;
        extension?: string;
        ipCountry?: string;
        deviceId?: string;
        deviceModel?: string;
    }): Promise<{ token: string; user: IUser; isNewUser: boolean; isPendingDeletion?: boolean; deletionDetails?: any }> {`;

const newGooglePayload = `    async googleAuth(payload: {
        idToken?: string;
        accessToken?: string;
        email?: string;
        name?: string;
        googleId?: string;
        photoUrl?: string;
        countryId?: string;
        countryCode?: string;
        referredBy?: string;
        extension?: string;
        ipCountry?: string;
        deviceId?: string;
        deviceModel?: string;
        appType?: 'filive' | 'fivo';
    }): Promise<{ token: string; user: IUser; isNewUser: boolean; isPendingDeletion?: boolean; deletionDetails?: any }> {`;

if (normContent.includes(normalize(oldGooglePayload))) {
    normContent = normContent.replace(normalize(oldGooglePayload), normalize(newGooglePayload));
    console.log('googleAuth payload replaced successfully');
} else {
    console.error('oldGooglePayload not found');
}

const oldGoogleUpdate = `            user.lastLoginAt = new Date();
            await user.save();`;

const newGoogleUpdate = `            if (payload.appType) {
                user.loginIn = payload.appType;
                user.appType = payload.appType;
                if (!user.registerIn) {
                    user.registerIn = payload.appType;
                }
                hasChanges = true;
            }
            user.lastLoginAt = new Date();
            await user.save();`;

if (normContent.includes(normalize(oldGoogleUpdate))) {
    normContent = normContent.replace(normalize(oldGoogleUpdate), normalize(newGoogleUpdate));
    console.log('googleAuth update replaced successfully');
} else {
    console.error('oldGoogleUpdate not found');
}

const oldGoogleCreate = `            user = await User.create({
                name: resolvedName || 'Google User',
                email: resolvedEmail || undefined,
                googleId: resolvedGoogleId,
                authProvider: 'google',
                userRole: 'user',
                deviceId: payload.deviceId,
                deviceModel: payload.deviceModel,
                isVerified: true,
                countryId: resolvedCountry?.countryId,
                country: resolvedCountry?.country,
                lastLoginAt: new Date(),
                socialProfile: {
                    provider: 'google',
                    id: resolvedGoogleId,
                    photoUrl: resolvedPhotoUrl,
                }
            });`;

const newGoogleCreate = `            const appType: 'filive' | 'fivo' = payload.appType === 'fivo' ? 'fivo' : 'filive';
            user = await User.create({
                name: resolvedName || 'Google User',
                email: resolvedEmail || undefined,
                googleId: resolvedGoogleId,
                authProvider: 'google',
                userRole: 'user',
                deviceId: payload.deviceId,
                deviceModel: payload.deviceModel,
                isVerified: true,
                countryId: resolvedCountry?.countryId,
                country: resolvedCountry?.country,
                lastLoginAt: new Date(),
                registerIn: appType,
                loginIn: appType,
                appType: appType,
                socialProfile: {
                    provider: 'google',
                    id: resolvedGoogleId,
                    photoUrl: resolvedPhotoUrl,
                }
            });`;

if (normContent.includes(normalize(oldGoogleCreate))) {
    normContent = normContent.replace(normalize(oldGoogleCreate), normalize(newGoogleCreate));
    console.log('googleAuth create replaced successfully');
} else {
    console.error('oldGoogleCreate not found');
}

// 6. Update facebookAuth
const oldFbPayload = `    async facebookAuth(payload: {
        accessToken: string;
        email?: string;
        name?: string;
        facebookId?: string;
        photoUrl?: string;
        countryId?: string;
        countryCode?: string;
        referredBy?: string;
        extension?: string;
        ipCountry?: string;
        deviceId?: string;
        deviceModel?: string;
    }): Promise<{ token: string; user: IUser; isNewUser: boolean; isPendingDeletion?: boolean; deletionDetails?: any }> {`;

const newFbPayload = `    async facebookAuth(payload: {
        accessToken: string;
        email?: string;
        name?: string;
        facebookId?: string;
        photoUrl?: string;
        countryId?: string;
        countryCode?: string;
        referredBy?: string;
        extension?: string;
        ipCountry?: string;
        deviceId?: string;
        deviceModel?: string;
        appType?: 'filive' | 'fivo';
    }): Promise<{ token: string; user: IUser; isNewUser: boolean; isPendingDeletion?: boolean; deletionDetails?: any }> {`;

if (normContent.includes(normalize(oldFbPayload))) {
    normContent = normContent.replace(normalize(oldFbPayload), normalize(newFbPayload));
    console.log('facebookAuth payload replaced successfully');
} else {
    console.error('oldFbPayload not found');
}

const oldFbCreate = `            user = await User.create({
                name: resolvedName || 'Facebook User',
                email: resolvedEmail || undefined,
                facebookId: resolvedFacebookId,
                authProvider: 'facebook',
                userRole: 'user',
                deviceId: payload.deviceId,
                deviceModel: payload.deviceModel,
                isVerified: true,
                countryId: resolvedCountry?.countryId,
                country: resolvedCountry?.country,
                lastLoginAt: new Date(),
                socialProfile: {
                    provider: 'facebook',
                    id: resolvedFacebookId,
                    photoUrl: resolvedPhotoUrl,
                }
            });`;

const newFbCreate = `            const appType: 'filive' | 'fivo' = payload.appType === 'fivo' ? 'fivo' : 'filive';
            user = await User.create({
                name: resolvedName || 'Facebook User',
                email: resolvedEmail || undefined,
                facebookId: resolvedFacebookId,
                authProvider: 'facebook',
                userRole: 'user',
                deviceId: payload.deviceId,
                deviceModel: payload.deviceModel,
                isVerified: true,
                countryId: resolvedCountry?.countryId,
                country: resolvedCountry?.country,
                lastLoginAt: new Date(),
                registerIn: appType,
                loginIn: appType,
                appType: appType,
                socialProfile: {
                    provider: 'facebook',
                    id: resolvedFacebookId,
                    photoUrl: resolvedPhotoUrl,
                }
            });`;

if (normContent.includes(normalize(oldFbCreate))) {
    normContent = normContent.replace(normalize(oldFbCreate), normalize(newFbCreate));
    console.log('facebookAuth create replaced successfully');
} else {
    console.error('oldFbCreate not found');
}

// 7. Update appleAuth
const oldApplePayload = `    async appleAuth(payload: {
        identityToken?: string;
        authorizationCode?: string;
        email?: string;
        name?: string;
        appleId?: string;
        photoUrl?: string;
        countryId?: string;
        countryCode?: string;
        referredBy?: string;
        extension?: string;
        ipCountry?: string;
        deviceId?: string;
        deviceModel?: string;
    }): Promise<{ token: string; user: IUser; isNewUser: boolean; isPendingDeletion?: boolean; deletionDetails?: any }> {`;

const newApplePayload = `    async appleAuth(payload: {
        identityToken?: string;
        authorizationCode?: string;
        email?: string;
        name?: string;
        appleId?: string;
        photoUrl?: string;
        countryId?: string;
        countryCode?: string;
        referredBy?: string;
        extension?: string;
        ipCountry?: string;
        deviceId?: string;
        deviceModel?: string;
        appType?: 'filive' | 'fivo';
    }): Promise<{ token: string; user: IUser; isNewUser: boolean; isPendingDeletion?: boolean; deletionDetails?: any }> {`;

if (normContent.includes(normalize(oldApplePayload))) {
    normContent = normContent.replace(normalize(oldApplePayload), normalize(newApplePayload));
    console.log('appleAuth payload replaced successfully');
} else {
    console.error('oldApplePayload not found');
}

const oldAppleCreate = `            user = await User.create({
                name: resolvedName || (resolvedEmail ? resolvedEmail.split('@')[0] : 'Apple User'),
                email: resolvedEmail || undefined,
                appleId: resolvedAppleId,
                authProvider: 'apple',
                userRole: 'user',
                deviceId: payload.deviceId,
                deviceModel: payload.deviceModel,
                isVerified: true,
                countryId: resolvedCountry?.countryId,
                country: resolvedCountry?.country,
                lastLoginAt: new Date(),
                referredBy: referrerObjId,
                socialProfile: {
                    provider: 'apple',
                    id: resolvedAppleId,
                    photoUrl: resolvedPhotoUrl,
                }
            });`;

const newAppleCreate = `            const appType: 'filive' | 'fivo' = payload.appType === 'fivo' ? 'fivo' : 'filive';
            user = await User.create({
                name: resolvedName || (resolvedEmail ? resolvedEmail.split('@')[0] : 'Apple User'),
                email: resolvedEmail || undefined,
                appleId: resolvedAppleId,
                authProvider: 'apple',
                userRole: 'user',
                deviceId: payload.deviceId,
                deviceModel: payload.deviceModel,
                isVerified: true,
                countryId: resolvedCountry?.countryId,
                country: resolvedCountry?.country,
                lastLoginAt: new Date(),
                referredBy: referrerObjId,
                registerIn: appType,
                loginIn: appType,
                appType: appType,
                socialProfile: {
                    provider: 'apple',
                    id: resolvedAppleId,
                    photoUrl: resolvedPhotoUrl,
                }
            });`;

if (normContent.includes(normalize(oldAppleCreate))) {
    normContent = normContent.replace(normalize(oldAppleCreate), normalize(newAppleCreate));
    console.log('appleAuth create replaced successfully');
} else {
    console.error('oldAppleCreate not found');
}

fs.writeFileSync(filePath, normContent, 'utf8');
console.log('Done updating AuthenticationService.ts');

