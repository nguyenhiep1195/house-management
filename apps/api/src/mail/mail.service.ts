import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const port = Number(config.getOrThrow<string>('SMTP_PORT'));
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });
    this.from = config.getOrThrow<string>('MAIL_FROM');
  }

  async sendPasswordReset(
    to: string,
    name: string,
    resetUrl: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Đặt lại mật khẩu — House Management',
      html: [
        `<p>Xin chào ${name},</p>`,
        '<p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>',
        `<p><a href="${resetUrl}">Nhấn vào đây để đặt lại mật khẩu</a> (liên kết có hiệu lực trong 15 phút và chỉ dùng được một lần).</p>`,
        '<p>Nếu bạn không yêu cầu, vui lòng bỏ qua email này.</p>',
      ].join('\n'),
    });
    this.logger.log(`Password reset email sent to ${to}`);
  }
}
