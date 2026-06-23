import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter | null = null;
  private fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const port = config.get<number>('SMTP_PORT') ?? 587;
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    this.fromAddress = config.get<string>('SMTP_FROM') ?? 'noreply@yumia.app';

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log(`Mailer initialisé — SMTP ${host}:${port}`);
    } else {
      this.logger.warn('Variables SMTP_HOST/SMTP_USER/SMTP_PASS manquantes — emails logués en console uniquement.');
    }
  }

  async sendPasswordResetOtp(to: string, otp: string): Promise<void> {
    const subject = 'Ton code YUMIA — réinitialisation de mot de passe';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h1 style="font-size:28px;margin-bottom:8px">🔑 Réinitialisation</h1>
        <p style="color:#666;margin-bottom:32px">
          Tu as demandé à réinitialiser ton mot de passe YUMIA.<br>
          Saisis ce code dans l'app — il expire dans <strong>15 minutes</strong>.
        </p>
        <div style="background:#f5f5f5;border-radius:12px;padding:24px;text-align:center;letter-spacing:12px;font-size:36px;font-weight:700;color:#111">
          ${otp}
        </div>
        <p style="color:#999;font-size:12px;margin-top:32px">
          Si tu n'es pas à l'origine de cette demande, ignore cet email. Ton mot de passe reste inchangé.
        </p>
      </div>
    `;

    if (this.transporter) {
      await this.transporter.sendMail({ from: this.fromAddress, to, subject, html });
      this.logger.log(`Email OTP envoyé à ${to}`);
    } else {
      this.logger.log(`[DEV EMAIL] Destinataire: ${to} | Code: ${otp}`);
    }
  }

  async sendWelcome(to: string, displayName: string): Promise<void> {
    const subject = 'Bienvenue sur YUMIA 🎉';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h1 style="font-size:28px;margin-bottom:8px">Bienvenue, ${escapeHtml(displayName)} 👋</h1>
        <p style="color:#666;line-height:1.6">
          Ton compte YUMIA est prêt. Ouvre l'app, laisse l'IA choisir ta prochaine expérience<br>
          et accumule des XP à chaque sortie.
        </p>
        <p style="color:#666;margin-top:24px">À très vite sur YUMIA,</p>
        <p style="color:#111;font-weight:700">L'équipe YUMIA ✨</p>
      </div>
    `;

    if (this.transporter) {
      await this.transporter.sendMail({ from: this.fromAddress, to, subject, html });
    } else {
      this.logger.log(`[DEV EMAIL] Welcome → ${to}`);
    }
  }
}
