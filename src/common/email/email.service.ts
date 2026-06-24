import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sgMail from '@sendgrid/mail';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly from: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('SENDGRID_API_KEY');
    this.from = this.config.get<string>('SENDGRID_FROM_EMAIL', 'noreply@vepaw.pk');
    this.enabled = !!apiKey;

    if (apiKey) {
      sgMail.setApiKey(apiKey);
    } else {
      this.logger.warn('SENDGRID_API_KEY not set — emails will be logged only');
    }
  }

  async sendSetPasswordEmail(to: string, name: string, token: string, role: string): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const link = `${frontendUrl}/auth/set-password?token=${token}`;
    const portalName = role.includes('vet') ? 'Vet Portal' : 'Store Portal';

    const subject = 'Your PawCare application has been approved!';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a2e;">Welcome to PawCare, ${name}!</h2>
        <p>Great news — your application for the <strong>${portalName}</strong> has been approved.</p>
        <p>Click the button below to set your password and get started:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${link}" style="background-color: #6366F1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Set Your Password</a>
        </div>
        <p style="color: #666; font-size: 14px;">This link expires in 72 hours. If you didn't apply, please ignore this email.</p>
        <p style="color: #666; font-size: 14px;">Or copy this link: <a href="${link}">${link}</a></p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px;">PawCare — Pet Care Platform, Lahore</p>
      </div>
    `;

    await this.send(to, subject, html);
  }

  async sendRejectionEmail(to: string, name: string, reason?: string): Promise<void> {
    const subject = 'Update on your PawCare application';
    const reasonBlock = reason
      ? `<p><strong>Reason:</strong> ${reason}</p>`
      : `<p>This could be due to incomplete documentation or other requirements not being met.</p>`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a2e;">Hi ${name},</h2>
        <p>Thank you for your interest in joining PawCare.</p>
        <p>After reviewing your application, we're unable to approve it at this time.</p>
        ${reasonBlock}
        <p>You're welcome to reapply with updated information.</p>
        <p>If you have questions, please reach out to our support team.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px;">PawCare — Pet Care Platform, Lahore</p>
      </div>
    `;

    await this.send(to, subject, html);
  }

  async sendStoreApprovalEmail(to: string, name: string, token: string): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const link = `${frontendUrl}/auth/set-password?token=${token}`;

    const subject = 'Your PawCare store has been approved!';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a2e;">Welcome to PawCare, ${name}!</h2>
        <p>Your store registration has been approved. Set your password to start managing your store:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${link}" style="background-color: #6366F1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Set Your Password</a>
        </div>
        <p style="color: #666; font-size: 14px;">This link expires in 72 hours.</p>
        <p style="color: #666; font-size: 14px;">Or copy this link: <a href="${link}">${link}</a></p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px;">PawCare — Pet Care Platform, Lahore</p>
      </div>
    `;

    await this.send(to, subject, html);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.enabled) {
      this.logger.log(`[EMAIL LOG] To: ${to} | Subject: ${subject}`);
      this.logger.log(`[EMAIL LOG] Body preview: ${html.replace(/<[^>]*>/g, '').slice(0, 200)}`);
      return;
    }

    try {
      await sgMail.send({ to, from: this.from, subject, html });
      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send email to ${to}: ${message}`);
    }
  }
}
