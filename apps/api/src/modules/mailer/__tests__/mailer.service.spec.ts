import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailerService } from '../mailer.service';

// ── Mock nodemailer ───────────────────────────────────────────────────────────
// jest.mock is hoisted — we cannot reference variables declared in this file
// inside the factory. Instead, we let createTransport return a fresh stub and
// retrieve the sendMail mock from the returned object after construction.

jest.mock('nodemailer');

const makeConfig = (smtp = true) => ({
  get: jest.fn((key: string) => {
    if (!smtp) return undefined;
    const map: Record<string, unknown> = {
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 587,
      SMTP_USER: 'user@example.com',
      SMTP_PASS: 'secret',
      SMTP_FROM: 'noreply@yumia.app',
    };
    return map[key];
  }),
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MailerService', () => {
  let sendMail: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  });

  async function buildService(smtpEnabled = true) {
    const module = await Test.createTestingModule({
      providers: [
        MailerService,
        { provide: ConfigService, useValue: makeConfig(smtpEnabled) },
      ],
    }).compile();
    return module.get(MailerService);
  }

  // ── sendPasswordResetOtp ──────────────────────────────────────────────────

  describe('sendPasswordResetOtp', () => {
    it('envoie un email OTP via SMTP quand le transporter est configuré', async () => {
      const service = await buildService();

      await service.sendPasswordResetOtp('user@test.com', '123456');

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: expect.stringContaining('réinitialisation'),
          html: expect.stringContaining('123456'),
        }),
      );
    });

    it('ne lève pas d\'erreur quand SMTP est absent (mode dev)', async () => {
      const service = await buildService(false);

      await expect(
        service.sendPasswordResetOtp('user@test.com', '654321'),
      ).resolves.toBeUndefined();

      expect(sendMail).not.toHaveBeenCalled();
    });

    it('inclut l\'OTP dans le corps HTML', async () => {
      const service = await buildService();
      let capturedHtml = '';
      sendMail.mockImplementation((opts: { html: string }) => {
        capturedHtml = opts.html;
        return Promise.resolve({});
      });

      await service.sendPasswordResetOtp('x@test.com', '999888');

      expect(capturedHtml).toContain('999888');
    });
  });

  // ── sendWelcome ───────────────────────────────────────────────────────────

  describe('sendWelcome', () => {
    it('envoie un email de bienvenue avec le nom affiché', async () => {
      const service = await buildService();

      await service.sendWelcome('new@test.com', 'Alice');

      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'new@test.com',
          subject: expect.stringContaining('Bienvenue'),
          html: expect.stringContaining('Alice'),
        }),
      );
    });

    it('échappe les caractères HTML dans le displayName (protection XSS)', async () => {
      const service = await buildService();
      let capturedHtml = '';
      sendMail.mockImplementation((opts: { html: string }) => {
        capturedHtml = opts.html;
        return Promise.resolve({});
      });

      await service.sendWelcome('hack@test.com', '<script>alert(1)</script>');

      expect(capturedHtml).toContain('&lt;script&gt;');
      expect(capturedHtml).not.toContain('<script>');
    });

    it('échappe les guillemets et esperluettes dans le displayName', async () => {
      const service = await buildService();
      let capturedHtml = '';
      sendMail.mockImplementation((opts: { html: string }) => {
        capturedHtml = opts.html;
        return Promise.resolve({});
      });

      await service.sendWelcome('x@test.com', 'A & B "C"');

      expect(capturedHtml).toContain('A &amp; B &quot;C&quot;');
      expect(capturedHtml).not.toContain('& B "');
    });

    it('ne lève pas d\'erreur quand SMTP est absent (mode dev)', async () => {
      const service = await buildService(false);

      await expect(
        service.sendWelcome('user@test.com', 'Bob'),
      ).resolves.toBeUndefined();

      expect(sendMail).not.toHaveBeenCalled();
    });
  });
});
