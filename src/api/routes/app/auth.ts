import { Router, Request, Response } from 'express';
import Container from "typedi";
import { AuthenticationService } from "../../../services/common/AuthenticationService";
import { ResponseWrapper } from '../../responseWrapper';
import { validate } from '../../validators';
import { sendOtpSchema, verifyOtpSchema, googleLoginSchema, facebookLoginSchema } from '../../validators/auth';
import { countryCodeFromIpHeaders } from '../../../utils/phoneCountry';

export default (router: Router) => {
    const authService = Container.get(AuthenticationService);

    /**
     * @swagger
     * /app/auth/send-otp:
     *   post:
     *     summary: Send OTP to mobile
     *     tags: [Auth]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - extension
     *               - mobile
     *             properties:
     *               extension:
     *                 type: string
     *               mobile:
     *                 type: string
     *               countryId:
     *                 type: string
     *               countryCode:
     *                 type: string
     *                 description: ISO country code from SIM/network
     *     responses:
     *       200:
     *         description: OTP sent successfully
     */
    router.post('/auth/send-otp',
        validate(sendOtpSchema, 'body'),
        async (req: Request, res: Response) => {
            try {
                const { extension, mobile, countryId, countryCode, referredBy } = req.body;
                const fullMobile = `${extension}${mobile}`;
                await authService.userSendOTP(fullMobile, countryId, referredBy, {
                    countryCode,
                    extension,
                    ipCountry: countryCodeFromIpHeaders(req.headers) || undefined,
                });
                return ResponseWrapper.success(res, null, 'OTP sent successfully');
            } catch (error: any) {
                return ResponseWrapper.error(res, error);
            }
        });

    /**
     * @swagger
     * /app/auth/verify-otp:
     *   post:
     *     summary: Verify mobile OTP
     *     tags: [Auth]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - extension
     *               - mobile
     *               - otp
     *             properties:
     *               extension:
     *                 type: string
     *               mobile:
     *                 type: string
     *               otp:
     *                 type: string
     *     responses:
     *       200:
     *         description: OTP verified successfully
     */
    router.post('/auth/verify-otp',
        validate(verifyOtpSchema, 'body'),
        async (req: Request, res: Response) => {
            try {
                const { extension, mobile, otp } = req.body;
                const fullMobile = `${extension}${mobile}`;
                const result = await authService.userVerifyOTP(fullMobile, otp);
                return ResponseWrapper.success(res, result, 'OTP verified successfully');
            } catch (error: any) {
                return ResponseWrapper.error(res, error);
            }
        });

    /**
     * @swagger
     * /app/auth/google:
     *   post:
     *     summary: Google Login and Sign up
     *     tags: [Auth]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               idToken:
     *                 type: string
     *               accessToken:
     *                 type: string
     *               email:
     *                 type: string
     *               name:
     *                 type: string
     *               googleId:
     *                 type: string
     *               photoUrl:
     *                 type: string
     *               countryId:
     *                 type: string
     *               countryCode:
     *                 type: string
     *               referredBy:
     *                 type: string
     *     responses:
     *       200:
     *         description: Google authentication successful
     */
    router.post('/auth/google',
        validate(googleLoginSchema, 'body'),
        async (req: Request, res: Response) => {
            try {
                const { idToken, accessToken, email, name, googleId, photoUrl, countryId, countryCode, referredBy, extension } = req.body;
                const result = await authService.googleAuth({
                    idToken,
                    accessToken,
                    email,
                    name,
                    googleId,
                    photoUrl,
                    countryId,
                    countryCode,
                    referredBy,
                    extension,
                    ipCountry: countryCodeFromIpHeaders(req.headers) || undefined,
                });
                return ResponseWrapper.success(res, result, 'Google authentication successful');
            } catch (error: any) {
                return ResponseWrapper.error(res, error);
            }
        });

    /**
     * @swagger
     * /app/auth/facebook:
     *   post:
     *     summary: Facebook Login and Sign up
     *     tags: [Auth]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               accessToken:
     *                 type: string
     *               email:
     *                 type: string
     *               name:
     *                 type: string
     *               facebookId:
     *                 type: string
     *               photoUrl:
     *                 type: string
     *               countryId:
     *                 type: string
     *               countryCode:
     *                 type: string
     *               referredBy:
     *                 type: string
     *     responses:
     *       200:
     *         description: Facebook authentication successful
     */
    router.post('/auth/facebook',
        validate(facebookLoginSchema, 'body'),
        async (req: Request, res: Response) => {
            try {
                const { accessToken, email, name, facebookId, photoUrl, countryId, countryCode, referredBy, extension } = req.body;
                const result = await authService.facebookAuth({
                    accessToken,
                    email,
                    name,
                    facebookId,
                    photoUrl,
                    countryId,
                    countryCode,
                    referredBy,
                    extension,
                    ipCountry: countryCodeFromIpHeaders(req.headers) || undefined,
                });
                return ResponseWrapper.success(res, result, 'Facebook authentication successful');
            } catch (error: any) {
                return ResponseWrapper.error(res, error);
            }
        });

    /**
     * @swagger
     * /app/auth/social-login:
     *   post:
     *     summary: Unified Social Login (Google or Facebook)
     *     tags: [Auth]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - provider
     *             properties:
     *               provider:
     *                 type: string
     *                 enum: [google, facebook]
     *               idToken:
     *                 type: string
     *               accessToken:
     *                 type: string
     *               email:
     *                 type: string
     *               name:
     *                 type: string
     *               socialId:
     *                 type: string
     *               photoUrl:
     *                 type: string
     *     responses:
     *       200:
     *         description: Social authentication successful
     */
    router.post('/auth/social-login', async (req: Request, res: Response) => {
        try {
            const { provider, idToken, accessToken, email, name, socialId, photoUrl, countryId, countryCode, referredBy, extension } = req.body;
            const ipCountry = countryCodeFromIpHeaders(req.headers) || undefined;

            if (provider === 'google') {
                const result = await authService.googleAuth({
                    idToken,
                    accessToken,
                    email,
                    name,
                    googleId: socialId,
                    photoUrl,
                    countryId,
                    countryCode,
                    referredBy,
                    extension,
                    ipCountry,
                });
                return ResponseWrapper.success(res, result, 'Google authentication successful');
            } else if (provider === 'facebook') {
                const result = await authService.facebookAuth({
                    accessToken: accessToken || idToken,
                    email,
                    name,
                    facebookId: socialId,
                    photoUrl,
                    countryId,
                    countryCode,
                    referredBy,
                    extension,
                    ipCountry,
                });
                return ResponseWrapper.success(res, result, 'Facebook authentication successful');
            } else {
                return ResponseWrapper.error(res, 'Invalid social provider. Supported: google, facebook');
            }
        } catch (error: any) {
            return ResponseWrapper.error(res, error);
        }
    });

    /**
     * @swagger
     * /app/auth/social-settings:
     *   get:
     *     summary: Get Client Public Social Authentication Keys & Toggles
     *     tags: [Auth]
     *     responses:
     *       200:
     *         description: Social authentication configuration for mobile client
     */
    router.get('/auth/social-settings', async (req: Request, res: Response) => {
        try {
            const settings = await authService.getSocialAuthSettings();
            return ResponseWrapper.success(res, settings, 'Social settings fetched successfully');
        } catch (error: any) {
            return ResponseWrapper.error(res, error);
        }
    });

    /**
     * @swagger
     * /app/auth/logout:
     *   post:
     *     summary: User logout
     *     tags: [Auth]
     *     security:
     *       - bearerAuth: []
     *     requestBody:
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               fcmToken:
     *                 type: string
     *     responses:
     *       200:
     *         description: Logged out successfully
     */
    router.post('/auth/logout', async (req: Request, res: Response) => {
        try {
            const userId = req.user?.id;
            const { fcmToken } = req.body || {};
            if (userId) {
                await authService.logout(userId, fcmToken);
            }
            return ResponseWrapper.success(res, null, 'Logged out successfully');
        } catch (error: any) {
            return ResponseWrapper.error(res, error);
        }
    });
}


