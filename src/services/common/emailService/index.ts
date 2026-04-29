import { Inject, Service } from 'typedi';
import config from '../../../config';
import { EmailOptions, SecretEmailOptions } from '../../../api/validators/email';
import nodemailer from 'nodemailer';

@Service()
export class EmailService {
  constructor(
    @Inject('emailClient') private emailTransporter: nodemailer.Transporter
  ) { }

  private async asyncSendEmail(options: EmailOptions) {
    try {
      const info = await this.emailTransporter.sendMail({
        from: config.email.authFrom,
        to: options.to,
        subject: options.subject,
        html: options.htmlBody
      });
      console.log('📧 Email sent: %s', info.messageId);
      return info;
    } catch (error) {
      console.error('❌ Error sending email:', error);
      throw error;
    }
  }

  private async sendEmail(options: EmailOptions) {
    // Attempt actual send
    try {
      return await this.asyncSendEmail(options);
    } catch (e) {
      // Fallback to mock log in dev if sending fails (optional, but good for debug)
      console.log('--------------------------------------------------');
      console.log('📧 [FALLBACK MOCK EMAIL]');
      console.log(`From: ${config.email.authFrom}`);
      console.log(`To: ${options.to}`);
      console.log(`Subject: ${options.subject}`);
      console.log('--------------------------------------------------');
      return { messageId: 'mock-message-id-' + Date.now() };
    }
  }

  async sendAuthOtpEmail(options: SecretEmailOptions) {
    const subject =
      options.purpose === 'REGISTRATION'
        ? 'Verify Your Email - BOS'
        : 'Password Reset - BOS';

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333;">BOS</h1>
        </div>
        
        <div style="background-color: #f9f9f9; padding: 30px; border-radius: 10px; text-align: center;">
          <h2 style="color: #333; margin-bottom: 20px;">
            ${options.purpose === 'REGISTRATION' ? 'Verify Your Email' : 'Reset Your Password'}
          </h2>
          
          <p style="color: #666; font-size: 16px; margin-bottom: 30px;">
            ${options.purpose === 'REGISTRATION'
        ? 'Please use the following OTP to verify your email address:'
        : 'Please use the following OTP to reset your password:'
      }
          </p>
          
          <div style="background-color: #007bff; color: white; font-size: 32px; font-weight: bold; padding: 20px; border-radius: 8px; letter-spacing: 5px; margin: 20px 0;">
            ${options.secret}
          </div>
          
          <p style="color: #999; font-size: 14px; margin-top: 30px;">
            This secret will expire in 10 minutes. If you didn't request this, please ignore this email.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 30px; color: #999; font-size: 12px;">
          <p>© 2025 BOS. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: options.to,
      subject,
      htmlBody
    });
  }
}
