import { Router, Request, Response } from 'express';
import Container from "typedi";
import { AuthenticationService } from "../../../services/common/AuthenticationService";
import { ResponseWrapper } from '../../responseWrapper';
import { validate } from '../../validators';
import { sendOtpSchema, verifyOtpSchema } from '../../validators/auth';

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
     *     responses:
     *       200:
     *         description: OTP sent successfully
     */
    router.post('/auth/send-otp',
        validate(sendOtpSchema, 'body'),
        async (req: Request, res: Response) => {
            try {
                const { extension, mobile, countryId } = req.body;
                const fullMobile = `${extension}${mobile}`;
                await authService.userSendOTP(fullMobile, countryId);
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
}
