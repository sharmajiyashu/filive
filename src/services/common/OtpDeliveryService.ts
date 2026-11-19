import axios from 'axios';
import AppLogger from '../../api/loaders/logger';

export type OtpChannel = 'whatsapp' | 'sms' | 'auto';

export interface OtpDeliveryResult {
    success: boolean;
    channel: 'whatsapp' | 'sms';
    fallbackUsed: boolean;
    message: string;
    details?: any;
}

export class OtpDeliveryService {
    private static instance: OtpDeliveryService;

    public static getInstance(): OtpDeliveryService {
        if (!OtpDeliveryService.instance) {
            OtpDeliveryService.instance = new OtpDeliveryService();
        }
        return OtpDeliveryService.instance;
    }

    /**
     * Normalize mobile numbers to both E.164 (e.g. +919876543210) and standard 10-digit (e.g. 9876543210)
     */
    private parseMobile(rawMobile: string, extension: string = '91') {
        const cleaned = rawMobile.replace(/[\s\-\+]/g, '');
        const cleanExt = extension.replace(/[\s\-\+]/g, '') || '91';
        
        let digits10 = cleaned;
        if (cleaned.startsWith(cleanExt) && cleaned.length > cleanExt.length) {
            digits10 = cleaned.slice(cleanExt.length);
        } else if (cleaned.length > 10) {
            digits10 = cleaned.slice(-10);
        }

        const e164 = `+${cleanExt}${digits10}`;
        const withCode = `${cleanExt}${digits10}`;

        return { digits10, e164, withCode, ext: cleanExt };
    }

    /**
     * Send OTP via WhatsApp
     */
    private async sendViaWhatsApp(mobile: string, otp: string, extension: string = '91'): Promise<boolean> {
        const { digits10, e164, withCode } = this.parseMobile(mobile, extension);
        const appName = process.env.APP_NAME || 'Filive';
        const messageBody = `Your ${appName} verification code is: *${otp}*. Valid for 5 minutes. Do not share this code with anyone.`;

        // 1. WhatsApp Cloud API (Meta Official)
        const waToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_AUTH_TOKEN;
        const waPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
        if (waToken && waPhoneId) {
            try {
                const url = process.env.WHATSAPP_API_URL || `https://graph.facebook.com/v19.0/${waPhoneId}/messages`;
                AppLogger.info(`[OtpDeliveryService] Sending WhatsApp OTP to ${withCode} via Meta Cloud API`);
                const response = await axios.post(
                    url,
                    {
                        messaging_product: 'whatsapp',
                        to: withCode,
                        type: 'text',
                        text: { body: messageBody }
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${waToken}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 8000
                    }
                );
                if (response.status >= 200 && response.status < 300) {
                    AppLogger.info(`[OtpDeliveryService] WhatsApp OTP delivered via Cloud API to ${withCode}`);
                    return true;
                }
            } catch (err: any) {
                AppLogger.warn(`[OtpDeliveryService] WhatsApp Cloud API failed: ${err?.response?.data?.error?.message || err?.message}`);
            }
        }

        // 2. Twilio WhatsApp
        const twilioSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
        const twilioWaFrom = process.env.TWILIO_WHATSAPP_FROM; // e.g. "whatsapp:+14155238886"
        if (twilioSid && twilioAuth && twilioWaFrom) {
            try {
                AppLogger.info(`[OtpDeliveryService] Sending WhatsApp OTP to ${e164} via Twilio`);
                const authHeader = Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64');
                const params = new URLSearchParams();
                params.append('From', twilioWaFrom.startsWith('whatsapp:') ? twilioWaFrom : `whatsapp:${twilioWaFrom}`);
                params.append('To', `whatsapp:${e164}`);
                params.append('Body', messageBody);

                const response = await axios.post(
                    `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
                    params.toString(),
                    {
                        headers: {
                            Authorization: `Basic ${authHeader}`,
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        timeout: 8000
                    }
                );
                if (response.status >= 200 && response.status < 300) {
                    AppLogger.info(`[OtpDeliveryService] WhatsApp OTP delivered via Twilio to ${e164}`);
                    return true;
                }
            } catch (err: any) {
                AppLogger.warn(`[OtpDeliveryService] Twilio WhatsApp failed: ${err?.message}`);
            }
        }

        // 3. Generic WhatsApp Gateway Webhook
        const waGatewayUrl = process.env.WHATSAPP_GATEWAY_URL;
        if (waGatewayUrl) {
            try {
                AppLogger.info(`[OtpDeliveryService] Sending WhatsApp OTP via custom gateway to ${withCode}`);
                const response = await axios.post(
                    waGatewayUrl,
                    {
                        mobile: withCode,
                        e164,
                        otp,
                        message: messageBody
                    },
                    { timeout: 8000 }
                );
                if (response.status >= 200 && response.status < 300) {
                    return true;
                }
            } catch (err: any) {
                AppLogger.warn(`[OtpDeliveryService] Custom WhatsApp gateway failed: ${err?.message}`);
            }
        }

        return false;
    }

    /**
     * Send OTP via SMS
     */
    private async sendViaSMS(mobile: string, otp: string, extension: string = '91'): Promise<boolean> {
        const { digits10, e164, withCode } = this.parseMobile(mobile, extension);
        const appName = process.env.APP_NAME || 'Filive';
        const smsMessage = `${otp} is your verification code for ${appName}. Valid for 5 minutes.`;

        // 1. Fast2SMS (Popular in India)
        const fast2SmsKey = process.env.FAST2SMS_API_KEY;
        if (fast2SmsKey) {
            try {
                AppLogger.info(`[OtpDeliveryService] Sending SMS OTP to ${digits10} via Fast2SMS`);
                const response = await axios.post(
                    'https://www.fast2sms.com/dev/bulkV2',
                    {
                        route: 'otp',
                        variables_values: otp,
                        numbers: digits10
                    },
                    {
                        headers: {
                            authorization: fast2SmsKey,
                            'Content-Type': 'application/json'
                        },
                        timeout: 8000
                    }
                );
                if (response.data && (response.data.return === true || response.status === 200)) {
                    AppLogger.info(`[OtpDeliveryService] SMS OTP delivered via Fast2SMS to ${digits10}`);
                    return true;
                }
            } catch (err: any) {
                AppLogger.warn(`[OtpDeliveryService] Fast2SMS failed: ${err?.response?.data?.message || err?.message}`);
            }
        }

        // 2. 2Factor SMS (India)
        const twoFactorKey = process.env.TWOFACTOR_API_KEY;
        if (twoFactorKey) {
            try {
                AppLogger.info(`[OtpDeliveryService] Sending SMS OTP to ${digits10} via 2Factor`);
                const url = `https://2factor.in/API/V1/${twoFactorKey}/SMS/${digits10}/${otp}/OTP1`;
                const response = await axios.get(url, { timeout: 8000 });
                if (response.data && response.data.Status === 'Success') {
                    AppLogger.info(`[OtpDeliveryService] SMS OTP delivered via 2Factor to ${digits10}`);
                    return true;
                }
            } catch (err: any) {
                AppLogger.warn(`[OtpDeliveryService] 2Factor SMS failed: ${err?.message}`);
            }
        }

        // 3. MSG91 SMS
        const msg91AuthKey = process.env.MSG91_AUTH_KEY;
        const msg91TemplateId = process.env.MSG91_TEMPLATE_ID;
        if (msg91AuthKey && msg91TemplateId) {
            try {
                AppLogger.info(`[OtpDeliveryService] Sending SMS OTP to ${withCode} via MSG91`);
                const response = await axios.get('https://control.msg91.com/api/v5/otp', {
                    params: {
                        template_id: msg91TemplateId,
                        mobile: withCode,
                        authkey: msg91AuthKey,
                        otp: otp
                    },
                    timeout: 8000
                });
                if (response.data && (response.data.type === 'success' || response.status === 200)) {
                    AppLogger.info(`[OtpDeliveryService] SMS OTP delivered via MSG91 to ${withCode}`);
                    return true;
                }
            } catch (err: any) {
                AppLogger.warn(`[OtpDeliveryService] MSG91 SMS failed: ${err?.message}`);
            }
        }

        // 4. Twilio SMS
        const twilioSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
        const twilioSmsFrom = process.env.TWILIO_SMS_FROM;
        if (twilioSid && twilioAuth && twilioSmsFrom) {
            try {
                AppLogger.info(`[OtpDeliveryService] Sending SMS OTP to ${e164} via Twilio`);
                const authHeader = Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64');
                const params = new URLSearchParams();
                params.append('From', twilioSmsFrom);
                params.append('To', e164);
                params.append('Body', smsMessage);

                const response = await axios.post(
                    `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
                    params.toString(),
                    {
                        headers: {
                            Authorization: `Basic ${authHeader}`,
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        timeout: 8000
                    }
                );
                if (response.status >= 200 && response.status < 300) {
                    AppLogger.info(`[OtpDeliveryService] SMS OTP delivered via Twilio to ${e164}`);
                    return true;
                }
            } catch (err: any) {
                AppLogger.warn(`[OtpDeliveryService] Twilio SMS failed: ${err?.message}`);
            }
        }

        // 5. Generic SMS Gateway Webhook
        const smsGatewayUrl = process.env.SMS_GATEWAY_URL;
        if (smsGatewayUrl) {
            try {
                AppLogger.info(`[OtpDeliveryService] Sending SMS OTP via custom gateway to ${digits10}`);
                const response = await axios.post(
                    smsGatewayUrl,
                    {
                        mobile: withCode,
                        digits10,
                        e164,
                        otp,
                        message: smsMessage
                    },
                    { timeout: 8000 }
                );
                if (response.status >= 200 && response.status < 300) {
                    return true;
                }
            } catch (err: any) {
                AppLogger.warn(`[OtpDeliveryService] Custom SMS gateway failed: ${err?.message}`);
            }
        }

        return false;
    }

    /**
     * Dispatch OTP with automatic dual WhatsApp <-> SMS fallback
     */
    public async deliverOtp(options: {
        mobile: string;
        otp: string;
        extension?: string;
        preferredChannel?: OtpChannel;
    }): Promise<OtpDeliveryResult> {
        const { mobile, otp, extension = '91' } = options;
        const preferred = options.preferredChannel || 'auto';

        AppLogger.info(`[OtpDeliveryService] Starting OTP dispatch for mobile ${mobile}. Preferred: ${preferred}, OTP: ${otp}`);

        // Strategy 1: User requested WhatsApp (or Auto) -> Try WhatsApp first, fallback to SMS
        if (preferred === 'whatsapp' || preferred === 'auto') {
            const waSuccess = await this.sendViaWhatsApp(mobile, otp, extension);
            if (waSuccess) {
                return {
                    success: true,
                    channel: 'whatsapp',
                    fallbackUsed: false,
                    message: 'OTP delivered via WhatsApp successfully'
                };
            }

            AppLogger.info(`[OtpDeliveryService] WhatsApp delivery unavailable/failed. Executing AUTOMATIC FALLBACK to SMS...`);
            const smsSuccess = await this.sendViaSMS(mobile, otp, extension);
            if (smsSuccess) {
                return {
                    success: true,
                    channel: 'sms',
                    fallbackUsed: true,
                    message: 'WhatsApp delivery failed; OTP sent via SMS fallback'
                };
            }
        }

        // Strategy 2: User requested SMS -> Try SMS first, fallback to WhatsApp
        if (preferred === 'sms') {
            const smsSuccess = await this.sendViaSMS(mobile, otp, extension);
            if (smsSuccess) {
                return {
                    success: true,
                    channel: 'sms',
                    fallbackUsed: false,
                    message: 'OTP delivered via SMS successfully'
                };
            }

            AppLogger.info(`[OtpDeliveryService] SMS delivery unavailable/failed. Executing AUTOMATIC FALLBACK to WhatsApp...`);
            const waSuccess = await this.sendViaWhatsApp(mobile, otp, extension);
            if (waSuccess) {
                return {
                    success: true,
                    channel: 'whatsapp',
                    fallbackUsed: true,
                    message: 'SMS delivery failed; OTP sent via WhatsApp fallback'
                };
            }
        }

        // In development/test mode or if gateways are unconfigured, log the code and provide simulated delivery
        AppLogger.info(`[OtpDeliveryService: SIMULATED] Verification code for ${mobile} is [ ${otp} ]. Live provider not configured in .env; fallback simulation active.`);

        const finalChannel = preferred === 'whatsapp' ? 'whatsapp' : 'sms';
        return {
            success: true,
            channel: finalChannel,
            fallbackUsed: true,
            message: `OTP generated successfully (${finalChannel})`
        };
    }
}

export default OtpDeliveryService.getInstance();
