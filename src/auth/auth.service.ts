import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { UsersService } from "../users/users.service";
import { User } from "../users/entities/user.entity";
import { MailService } from "../mail/mail.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { JwtPayload } from "./types/jwt-payload.interface";

export interface AuthResult {
  accessToken: string;
  user: User;
}

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const user = await this.usersService.create(
      dto.name,
      dto.email,
      dto.password,
    );
    return this.buildAuthResult(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordMatches = await this.usersService.validatePassword(
      user,
      dto.password,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return this.buildAuthResult(user, dto.rememberMe);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const message =
      "If an account with that email exists, a password reset link has been sent.";

    const user = await this.usersService.findByEmail(dto.email);
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = this.hashToken(token);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await this.usersService.setPasswordResetToken(
        user.id,
        tokenHash,
        expiresAt,
      );

      const baseUrl =
        this.configService.get<string>("RESET_PASSWORD_URL") ??
        "http://localhost:5173/reset-password";
      const resetUrl = `${baseUrl}?token=${token}`;

      await this.mailService.sendPasswordResetEmail(user.email, resetUrl);
    }

    return { message };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = this.hashToken(dto.token);
    const user =
      await this.usersService.findByPasswordResetTokenHash(tokenHash);

    if (
      !user ||
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException("Invalid or expired reset token");
    }

    await this.usersService.resetPassword(user, dto.newPassword);

    return { message: "Password has been reset successfully." };
  }

  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private buildAuthResult(user: User, rememberMe = false): AuthResult {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return {
      // A remembered session gets a long-lived token; otherwise fall back to
      // the module's configured default (JWT_EXPIRES_IN, normally 1 day).
      accessToken: this.jwtService.sign(
        payload,
        rememberMe ? { expiresIn: "30d" } : undefined,
      ),
      user,
    };
  }
}
