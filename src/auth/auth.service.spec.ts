import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { UsersService } from "../users/users.service";
import { JwtService } from "@nestjs/jwt";
import { User, UserRole } from "../users/entities/user.entity";

describe("AuthService", () => {
  let service: AuthService;
  let usersService: jest.Mocked<
    Pick<UsersService, "create" | "findByEmail" | "validatePassword">
  >;
  let jwtService: jest.Mocked<Pick<JwtService, "sign">>;

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
    };
    jwtService = { sign: jest.fn().mockReturnValue("signed.jwt.token") };

    service = new AuthService(
      usersService as unknown as UsersService,
      jwtService as unknown as JwtService,
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
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: user.id,
        email: user.email,
      });
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
});
