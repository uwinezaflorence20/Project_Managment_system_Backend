import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    this.from =
      this.configService.get<string>("SMTP_FROM") ??
      "no-reply@project-management.dev";

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>("SMTP_HOST"),
      port: this.configService.get<number>("SMTP_PORT") ?? 587,
      secure: this.configService.get<string>("SMTP_SECURE") === "true",
      auth: {
        user: this.configService.get<string>("SMTP_USER"),
        pass: this.configService.get<string>("SMTP_PASS"),
      },
    });
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: "Reset your password",
        text: `We received a request to reset your password. Use the link below to choose a new one. This link expires in 30 minutes.\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
        html: `<p>We received a request to reset your password. Use the link below to choose a new one. This link expires in 30 minutes.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
      });
    } catch (error) {
      // Delivery failures shouldn't leak whether an account exists or break the request flow.
      this.logger.error(`Failed to send password reset email to ${to}`, error);
    }
  }
}
