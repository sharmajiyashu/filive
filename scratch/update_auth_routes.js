const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'api', 'routes', 'app', 'auth.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Replace imports if needed
content = content.replace(
    "import { sendOtpSchema, verifyOtpSchema, googleLoginSchema, facebookLoginSchema } from '../../validators/auth';",
    "import { sendOtpSchema, verifyOtpSchema, userRegisterSchema, userLoginSchema, googleLoginSchema, facebookLoginSchema } from '../../validators/auth';\nimport { appAuthMiddleware } from '../../middleware/appAuthMiddleware';\nimport User from '../../../models/User';"
);

// Add getAppType helper after getDeviceSignals
const oldSignals = `    const getDeviceSignals = (req: Request) => {
        const deviceId = (req.body.deviceId || req.headers['x-device-id'] || req.headers['device-id'] || '').toString().trim();
        const deviceModel = (req.body.deviceModel || req.headers['x-device-model'] || '').toString().trim();
        return { deviceId, deviceModel };
    };`;

const newSignals = `    const getDeviceSignals = (req: Request) => {
        const deviceId = (req.body.deviceId || req.headers['x-device-id'] || req.headers['device-id'] || '').toString().trim();
        const deviceModel = (req.body.deviceModel || req.headers['x-device-model'] || '').toString().trim();
        return { deviceId, deviceModel };
    };

    const getAppType = (req: Request): 'filive' | 'fivo' => {
        const headerApp = (req.headers['x-app-type'] || req.headers['x-app-name'] || req.headers['app-type'] || '').toString().toLowerCase().trim();
        const bodyApp = (req.body.appType || req.body.registerIn || req.body.loginIn || req.body.appName || req.body.app || '').toString().toLowerCase().trim();
        if (headerApp === 'fivo' || bodyApp === 'fivo') {
            return 'fivo';
        }
        return 'filive';
    };`;

content = content.replace(oldSignals, newSignals);

// Update send-otp
const oldSendOtp = `    router.post('/auth/send-otp',
        validate(sendOtpSchema, 'body'),
        async (req: Request, res: Response) => {
            try {
                const { extension, mobile, countryId, countryCode, referredBy } = req.body;
                const { deviceId, deviceModel } = getDeviceSignals(req);
                const fullMobile = \`\${extension}\${mobile}\`;
                await authService.userSendOTP(fullMobile, countryId, referredBy, {
                    countryCode,
                    extension,
                    ipCountry: countryCodeFromIpHeaders(req.headers) || undefined,
                    deviceId,
                    deviceModel,
                });
                return ResponseWrapper.success(res, null, 'OTP sent successfully');
            } catch (error: any) {
                return ResponseWrapper.error(res, error);
            }
        });`;

const newSendOtp = `    router.post('/auth/send-otp',
        validate(sendOtpSchema, 'body'),
        async (req: Request, res: Response) => {
            try {
                const { extension, mobile, countryId, countryCode, referredBy } = req.body;
                const { deviceId, deviceModel } = getDeviceSignals(req);
                const appType = getAppType(req);
                const fullMobile = \`\${extension}\${mobile}\`;
                const result = await authService.userSendOTP(fullMobile, countryId, referredBy, {
                    countryCode,
                    extension,
                    ipCountry: countryCodeFromIpHeaders(req.headers) || undefined,
                    deviceId,
                    deviceModel,
                    appType,
                });
                return ResponseWrapper.success(res, result, 'OTP sent successfully');
            } catch (error: any) {
                return ResponseWrapper.error(res, error);
            }
        });`;

content = content.replace(oldSendOtp, newSendOtp);

// Update verify-otp
const oldVerifyOtp = `    router.post('/auth/verify-otp',
        validate(verifyOtpSchema, 'body'),
        async (req: Request, res: Response) => {
            try {
                const { extension, mobile, otp } = req.body;
                const { deviceId, deviceModel } = getDeviceSignals(req);
                const fullMobile = \`\${extension}\${mobile}\`;
                const result = await authService.userVerifyOTP(fullMobile, otp, deviceId, deviceModel);
                return ResponseWrapper.success(res, result, 'OTP verified successfully');
            } catch (error: any) {
                return ResponseWrapper.error(res, error);
            }
        });`;

const newVerifyOtp = `    router.post('/auth/verify-otp',
        validate(verifyOtpSchema, 'body'),
        async (req: Request, res: Response) => {
            try {
                const { extension, mobile, otp } = req.body;
                const { deviceId, deviceModel } = getDeviceSignals(req);
                const appType = getAppType(req);
                const fullMobile = \`\${extension}\${mobile}\`;
                const result = await authService.userVerifyOTP(fullMobile, otp, deviceId, deviceModel, appType);
                return ResponseWrapper.success(res, result, 'OTP verified successfully');
            } catch (error: any) {
                return ResponseWrapper.error(res, error);
            }
        });

    router.post('/auth/register',
        validate(userRegisterSchema, 'body'),
        async (req: Request, res: Response) => {
            try {
                const { deviceId, deviceModel } = getDeviceSignals(req);
                const appType = getAppType(req);
                const result = await authService.userRegister({
                    ...req.body,
                    deviceId,
                    deviceModel,
                    appType,
                });
                return ResponseWrapper.success(res, result, 'User registered successfully');
            } catch (error: any) {
                return ResponseWrapper.error(res, error);
            }
        });

    router.post('/auth/login',
        validate(userLoginSchema, 'body'),
        async (req: Request, res: Response) => {
            try {
                const { email, mobile, password } = req.body;
                const { deviceId, deviceModel } = getDeviceSignals(req);
                const appType = getAppType(req);
                const result = await authService.userLogin(
                    email || mobile,
                    password,
                    appType,
                    deviceId,
                    deviceModel
                );
                return ResponseWrapper.success(res, result, 'User logged in successfully');
            } catch (error: any) {
                return ResponseWrapper.error(res, error);
            }
        });`;

content = content.replace(oldVerifyOtp, newVerifyOtp);

// Update googleAuth call to pass appType
content = content.replace(
    "ipCountry: countryCodeFromIpHeaders(req.headers) || undefined,\n                    deviceId,\n                    deviceModel,\n                });\n                return ResponseWrapper.success(res, result, 'Google authentication successful');",
    "ipCountry: countryCodeFromIpHeaders(req.headers) || undefined,\n                    deviceId,\n                    deviceModel,\n                    appType: getAppType(req),\n                });\n                return ResponseWrapper.success(res, result, 'Google authentication successful');"
);

// Update facebookAuth call to pass appType
content = content.replace(
    "ipCountry: countryCodeFromIpHeaders(req.headers) || undefined,\n                    deviceId,\n                    deviceModel,\n                });\n                return ResponseWrapper.success(res, result, 'Facebook authentication successful');",
    "ipCountry: countryCodeFromIpHeaders(req.headers) || undefined,\n                    deviceId,\n                    deviceModel,\n                    appType: getAppType(req),\n                });\n                return ResponseWrapper.success(res, result, 'Facebook authentication successful');"
);

// Update appleAuth call in router.post('/auth/apple'
content = content.replace(
    "ipCountry: countryCodeFromIpHeaders(req.headers) || undefined,\n                deviceId,\n                deviceModel,\n            });\n            return ResponseWrapper.success(res, result, 'Apple authentication successful');",
    "ipCountry: countryCodeFromIpHeaders(req.headers) || undefined,\n                deviceId,\n                deviceModel,\n                appType: getAppType(req),\n            });\n            return ResponseWrapper.success(res, result, 'Apple authentication successful');"
);

// Update social-login handler to pass appType
content = content.replace(
    "const ipCountry = countryCodeFromIpHeaders(req.headers) || undefined;\n            const { deviceId, deviceModel } = getDeviceSignals(req);",
    "const ipCountry = countryCodeFromIpHeaders(req.headers) || undefined;\n            const { deviceId, deviceModel } = getDeviceSignals(req);\n            const appType = getAppType(req);"
);

content = content.replace(
    "deviceId,\n                    deviceModel,\n                });\n                return ResponseWrapper.success(res, result, 'Google authentication successful');",
    "deviceId,\n                    deviceModel,\n                    appType,\n                });\n                return ResponseWrapper.success(res, result, 'Google authentication successful');"
);

// Add GET /auth/me route
const meRoute = `    router.get('/auth/me',
        appAuthMiddleware,
        async (req: Request, res: Response) => {
            try {
                const userId = req.user?.id;
                const user = await User.findById(userId).populate('profileImage').populate('countryId');
                if (!user) {
                    return ResponseWrapper.error(res, 'User not found', 404);
                }
                return ResponseWrapper.success(res, user, 'Current user profile fetched successfully');
            } catch (error: any) {
                return ResponseWrapper.error(res, error);
            }
        });

    router.post('/auth/logout'`;

content = content.replace("router.post('/auth/logout'", meRoute);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done updating auth.ts');

