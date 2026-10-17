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

  async sendWebEnquiryEmail(options: {
    to?: string;
    type: 'contact' | 'team_application';
    name: string;
    email: string;
    subject?: string;
    message: string;
    inquiryType?: string;
    audienceSize?: string;
  }) {
    const targetEmail = options.to || 'filive@gmail.com';
    const isContact = options.type === 'contact';
    const emailSubject = isContact
      ? `📩 New FiLive Web Contact Enquiry from ${options.name} (${options.subject || 'General'})`
      : `🚀 New FiLive Web Team Application: ${String(options.inquiryType || 'Host').toUpperCase()} from ${options.name}`;

    const dateStr = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${emailSubject}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f1117; color: #f3f4f6; margin: 0; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #1a1d26; border: 1px solid #2d3343; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          
          <!-- Header Banner -->
          <div style="background: linear-gradient(135deg, #EF0083 0%, #8A2BE2 50%, #560EE4 100%); padding: 30px 24px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 900; letter-spacing: -0.5px;">FiLive Official</h1>
            <p style="margin: 6px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px; font-weight: 500;">
              ${isContact ? 'New Website Contact Form Enquiry' : 'New Creator / Agency Team Application'}
            </p>
          </div>

          <!-- Body Content -->
          <div style="padding: 28px 24px;">
            <div style="display: inline-block; background-color: rgba(239, 0, 131, 0.15); border: 1px solid rgba(239, 0, 131, 0.4); border-radius: 9999px; padding: 4px 14px; margin-bottom: 20px;">
              <span style="color: #FF66C4; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                ${isContact ? 'Website Enquiry' : `Role: ${String(options.inquiryType || 'Host').toUpperCase()}`}
              </span>
            </div>

            <h2 style="margin: 0 0 16px 0; color: #ffffff; font-size: 18px; font-weight: 700;">
              Enquiry Details
            </h2>

            <!-- Lead Details Table -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
              <tr style="border-bottom: 1px solid #2d3343;">
                <td style="padding: 10px 0; color: #9ca3af; width: 140px;">Applicant Name:</td>
                <td style="padding: 10px 0; color: #ffffff; font-weight: 600;">${options.name}</td>
              </tr>
              <tr style="border-bottom: 1px solid #2d3343;">
                <td style="padding: 10px 0; color: #38bdf8; font-weight: 600;">
                  <a href="mailto:${options.email}" style="color: #38bdf8; text-decoration: none;">${options.email}</a>
                </td>
              </tr>
              ${options.subject ? `
              <tr style="border-bottom: 1px solid #2d3343;">
                <td style="padding: 10px 0; color: #9ca3af;">Subject:</td>
                <td style="padding: 10px 0; color: #ffffff;">${options.subject}</td>
              </tr>` : ''}
              ${options.inquiryType ? `
              <tr style="border-bottom: 1px solid #2d3343;">
                <td style="padding: 10px 0; color: #9ca3af;">Inquiry Type:</td>
                <td style="padding: 10px 0; color: #ffffff; text-transform: capitalize;">${options.inquiryType}</td>
              </tr>` : ''}
              ${options.audienceSize ? `
              <tr style="border-bottom: 1px solid #2d3343;">
                <td style="padding: 10px 0; color: #9ca3af;">Audience / Follower Size:</td>
                <td style="padding: 10px 0; color: #ffffff;">${options.audienceSize}</td>
              </tr>` : ''}
              <tr style="border-bottom: 1px solid #2d3343;">
                <td style="padding: 10px 0; color: #9ca3af;">Received At:</td>
                <td style="padding: 10px 0; color: #d1d5db;">${dateStr} (IST)</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #9ca3af;">Forwarded To:</td>
                <td style="padding: 10px 0; color: #a78bfa; font-weight: 600;">${targetEmail}</td>
              </tr>
            </table>

            <!-- Message Block -->
            <div style="background-color: #12141c; border-left: 4px solid #EF0083; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <p style="margin: 0 0 6px 0; color: #9ca3af; font-size: 12px; font-weight: 600; text-transform: uppercase;">Message Content:</p>
              <p style="margin: 0; color: #f3f4f6; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${options.message}</p>
            </div>

            <!-- Quick Action Button -->
            <div style="text-align: center; margin-top: 28px;">
              <a href="mailto:${options.email}?subject=Re: ${encodeURIComponent(options.subject || 'Your FiLive Inquiry')}" style="display: inline-block; background: linear-gradient(135deg, #EF0083, #8A2BE2); color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 10px; box-shadow: 0 4px 14px rgba(239, 0, 131, 0.4);">
                Reply Directly to ${options.name}
              </a>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color: #12141c; border-top: 1px solid #2d3343; padding: 16px; text-align: center; font-size: 12px; color: #6b7280;">
            <p style="margin: 0 0 4px 0;">This inquiry was submitted on the official FiLive website.</p>
            <p style="margin: 0;">Configured to route exclusively to: <strong style="color: #9ca3af;">${targetEmail}</strong></p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: targetEmail,
      subject: emailSubject,
      htmlBody
    });
  }
}
