import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { UsersService } from "../users/users.service";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { MailService } from "../mail/mail.service";
import { User, UserRole } from "../users/entities/user.entity";

describe("AuthService", () => {
  let service: AuthService;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      | "create"
      | "findByEmail"
      | "validatePassword"
      | "setPasswordResetToken"
      | "findByPasswordResetTokenHash"
      | "resetPassword"
    >
  >;
  let jwtService: jest.Mocked<Pick<JwtService, "sign">>;
  let mailService: jest.Mocked<Pick<MailService, "sendPasswordResetEmail">>;
  let configService: jest.Mocked<Pick<ConfigService, "get">>;

  const user: User = {
    id: "user-1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "hashed",
    role: UserRole.USER,
    boards: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;

  beforeEach(() => {
    usersService = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      validatePassword: jest.fn(),
      setPasswordResetToken: jest.fn(),
      findByPasswordResetTokenHash: jest.fn(),
      resetPassword: jest.fn(),
    };
    jwtService = { sign: jest.fn().mockReturnValue("signed.jwt.token") };
    mailService = { sendPasswordResetEmail: jest.fn() };
    configService = { get: jest.fn() };

    service = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
      mailService as unknown as MailService,
      configService as unknown as ConfigService,
    );
  });

  describe("register", () => {
    it("creates the user and returns an access token", async () => {
      usersService.create.mockResolvedValue(user);

      const result = await service.register({
        name: user.name,
        email: user.email,
        password: "StrongPassword123",
      });

      expect(usersService.create).toHaveBeenCalledWith(
        user.name,
        user.email,
        "StrongPassword123",
      );
      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: user.id, email: user.email },
        undefined,
      );
      expect(result).toEqual({ accessToken: "signed.jwt.token", user });
    });

    it("propagates a duplicate-email failure from UsersService", async () => {
      usersService.create.mockRejectedValue(
        new Error("An account with this email already exists"),
      );

      await expect(
        service.register({
          name: user.name,
          email: user.email,
          password: "StrongPassword123",
        }),
      ).rejects.toThrow("An account with this email already exists");
    });
  });

  describe("login", () => {
    it("returns an access token when credentials are valid", async () => {
      usersService.findByEmail.mockResolvedValue(user);
      usersService.validatePassword.mockResolvedValue(true);

      const result = await service.login({
        email: user.email,
        password: "StrongPassword123",
      });

      expect(result).toEqual({ accessToken: "signed.jwt.token", user });
    });

    it("rejects with UnauthorizedException for an unknown email", async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: "nobody@example.com", password: "whatever" }),
      ).rejects.toThrow(UnauthorizedException);
      expect(usersService.validatePassword).not.toHaveBeenCalled();
    });

    it("rejects with UnauthorizedException for a wrong password", async () => {
      usersService.findByEmail.mockResolvedValue(user);
      usersService.validatePassword.mockResolvedValue(false);

      await expect(
        service.login({ email: user.email, password: "wrong-password" }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("forgotPassword", () => {
    it("stores a hashed token and emails a reset link when the user exists", async () => {
      usersService.findByEmail.mockResolvedValue(user);

      const result = await service.forgotPassword({ email: user.email });

      expect(usersService.setPasswordResetToken).toHaveBeenCalledWith(
        user.id,
        expect.any(String),
        expect.any(Date),
      );
      const storedHash = usersService.setPasswordResetToken.mock
        .calls[0][1] as string;
      expect(storedHash).toMatch(/^[a-f0-9]{64}$/);

      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        user.email,
        expect.stringContaining("reset-password?token="),
      );
      expect(result.message).toMatch(/if an account/i);
    });

    it("returns the same generic message without sending an email for an unknown address", async () => {
      usersService.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: "nobody@example.com",
      });

      expect(usersService.setPasswordResetToken).not.toHaveBeenCalled();
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(result.message).toMatch(/if an account/i);
    });
  });

  describe("resetPassword", () => {
    it("resets the password when the token is valid and unexpired", async () => {
      usersService.findByPasswordResetTokenHash.mockResolvedValue({
        ...user,
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
      });

      const result = await service.resetPassword({
        token: "a-raw-token",
        newPassword: "NewStrongPassword456",
      });

      expect(usersService.resetPassword).toHaveBeenCalledWith(
        expect.objectContaining({ id: user.id }),
        "NewStrongPassword456",
      );
      expect(result.message).toMatch(/reset successfully/i);
    });

    it("rejects an unknown token", async () => {
      usersService.findByPasswordResetTokenHash.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: "bogus-token",
          newPassword: "NewStrongPassword456",
        }),
      ).rejects.toThrow(BadRequestException);
      expect(usersService.resetPassword).not.toHaveBeenCalled();
    });

    it("rejects an expired token", async () => {
      usersService.findByPasswordResetTokenHash.mockResolvedValue({
        ...user,
        passwordResetExpiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        service.resetPassword({
          token: "expired-token",
          newPassword: "NewStrongPassword456",
        }),
      ).rejects.toThrow(BadRequestException);
      expect(usersService.resetPassword).not.toHaveBeenCalled();
    });
  });
});
