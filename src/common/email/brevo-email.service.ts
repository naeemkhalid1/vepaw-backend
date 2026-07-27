import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';

// Same public shape as EmailService (SendGrid) for sendSetPasswordEmail/sendRejectionEmail/
// sendStoreApprovalEmail — a drop-in swap at any existing call site. SendGrid's own file/config
// is left untouched (not currently usable — see ARCHETECTURE.md); this is what actually sends
// mail today. Uses Brevo's REST API directly via fetch rather than their SDK — same choice made
// for Nominatim, avoids an extra dependency for what's a single POST endpoint.
@Injectable()
export class BrevoEmailService {
  private readonly logger = new Logger(BrevoEmailService.name);
  private readonly apiKey: string | undefined;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('BREVO_API_KEY');
    this.fromEmail = this.config.get<string>(
      'BREVO_FROM_EMAIL',
      'noreply@vepaw.pk',
    );
    this.fromName = this.config.get<string>('BREVO_FROM_NAME', 'PawCare');
    this.enabled = !!this.apiKey;

    if (!this.apiKey) {
      this.logger.warn('BREVO_API_KEY not set — emails will be logged only');
    }
  }

  async sendSetPasswordEmail(
    to: string,
    name: string,
    token: string,
    role: string,
  ): Promise<void> {
    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
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

    await this.send(to, name, subject, html);
  }

  async sendRejectionEmail(
    to: string,
    name: string,
    reason?: string,
  ): Promise<void> {
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

    await this.send(to, name, subject, html);
  }

  async sendStoreApprovalEmail(
    to: string,
    name: string,
    token: string,
  ): Promise<void> {
    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
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

    await this.send(to, name, subject, html);
  }

  // New — team invites (vet clinic staff / store fulfilment staff) previously created an Invite
  // document and told the caller "Invite sent" without ever sending anything; the invitee only
  // found out if someone manually copied the link to them. This is the fix.
  async sendTeamInviteEmail(
    to: string,
    inviteeName: string,
    inviterName: string,
    entityName: string,
    role: string,
    token: string,
    entityType: 'vet' | 'store',
  ): Promise<void> {
    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    // NOTE: confirm this route with the frontend — mirrors the set-password link pattern above,
    // but the vet/store portals may use a different path for their invite-accept screen.
    const link = `${frontendUrl}/${entityType}/invite?token=${token}`;

    const subject = `${inviterName} invited you to join ${entityName} on PawCare`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a2e;">Hi ${inviteeName},</h2>
        <p><strong>${inviterName}</strong> has invited you to join <strong>${entityName}</strong> as a <strong>${role}</strong> on PawCare.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${link}" style="background-color: #6366F1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Accept Invite</a>
        </div>
        <p style="color: #666; font-size: 14px;">This invite expires in 7 days.</p>
        <p style="color: #666; font-size: 14px;">Or copy this link: <a href="${link}">${link}</a></p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px;">PawCare — Pet Care Platform, Lahore</p>
      </div>
    `;

    await this.send(to, inviteeName, subject, html);
  }

  private async send(
    to: string,
    toName: string,
    subject: string,
    html: string,
  ): Promise<void> {
    if (!this.enabled) {
      this.logger.log(`[EMAIL LOG] To: ${to} | Subject: ${subject}`);
      this.logger.log(
        `[EMAIL LOG] Body preview: ${html.replace(/<[^>]*>/g, '').slice(0, 200)}`,
      );
      return;
    }

    try {
      const res = await fetch(BREVO_SEND_URL, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey!,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: this.fromName, email: this.fromEmail },
          to: [{ email: to, name: toName }],
          subject,
          htmlContent: html,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Brevo API ${res.status}: ${body}`);
      }

      this.logger.log(`Email sent to ${to}: ${subject}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send email to ${to}: ${message}`);
    }
  }
}
