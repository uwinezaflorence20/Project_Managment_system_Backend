import { BadRequestException, ConflictException } from "@nestjs/common";
import { Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import { UsersService } from "./users.service";
import { User, UserRole } from "./entities/user.entity";

describe("UsersService", () => {
  let service: UsersService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    find: jest.Mock;
  };

  const baseUser = (overrides: Partial<User> = {}): User =>
    ({
      id: "user-1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "hashed-password",
      role: UserRole.USER,
      boards: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as User;

  beforeEach(() => {
    repo = {
      create: jest.fn((data) => data as User),
      save: jest.fn(async (entity) => entity as User),
      findOne: jest.fn(),
      update: jest.fn(),
      find: jest.fn(),
    };
    service = new UsersService(repo as unknown as Repository<User>);
  });

  describe("create", () => {
    it("hashes the password and persists a new user", async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.create(
        "Ada Lovelace",
        "ada@example.com",
        "StrongPassword123",
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Ada Lovelace",
          email: "ada@example.com",
          role: UserRole.USER,
        }),
      );
      const persistedPassword = (repo.create as jest.Mock).mock.calls[0][0]
        .password;
      expect(persistedPassword).not.toBe("StrongPassword123");
      expect(await bcrypt.compare("StrongPassword123", persistedPassword)).toBe(
        true,
      );
      expect(result.email).toBe("ada@example.com");
    });

    it("rejects with ConflictException when the email is already taken", async () => {
      repo.findOne.mockResolvedValue(baseUser());

      await expect(
        service.create("Ada Lovelace", "ada@example.com", "StrongPassword123"),
      ).rejects.toThrow(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe("validatePassword", () => {
    it("returns true for a matching password", async () => {
      const hashed = await bcrypt.hash("correct-password", 10);
      const user = baseUser({ password: hashed });

      await expect(
        service.validatePassword(user, "correct-password"),
      ).resolves.toBe(true);
    });

    it("returns false for a non-matching password", async () => {
      const hashed = await bcrypt.hash("correct-password", 10);
      const user = baseUser({ password: hashed });

      await expect(
        service.validatePassword(user, "wrong-password"),
      ).resolves.toBe(false);
    });
  });

  describe("changePassword", () => {
    it("throws BadRequestException when the current password is wrong", async () => {
      const hashed = await bcrypt.hash("correct-password", 10);
      repo.findOne.mockResolvedValue(baseUser({ password: hashed }));

      await expect(
        service.changePassword("user-1", {
          currentPassword: "wrong-password",
          newPassword: "NewStrongPassword123",
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("hashes and saves the new password when the current one is correct", async () => {
      const hashed = await bcrypt.hash("correct-password", 10);
      repo.findOne.mockResolvedValue(baseUser({ password: hashed }));

      await service.changePassword("user-1", {
        currentPassword: "correct-password",
        newPassword: "NewStrongPassword123",
      });

      const savedUser = (repo.save as jest.Mock).mock.calls[0][0] as User;
      expect(savedUser.password).not.toBe(hashed);
      expect(
        await bcrypt.compare("NewStrongPassword123", savedUser.password),
      ).toBe(true);
    });
  });

  describe("findAll", () => {
    it("returns users ordered by name", async () => {
      const users = [baseUser()];
      repo.find.mockResolvedValue(users);

      const result = await service.findAll();

      expect(repo.find).toHaveBeenCalledWith({ order: { name: "ASC" } });
      expect(result).toBe(users);
    });
  });

  describe("setPasswordResetToken", () => {
    it("persists the token hash and expiry via update", async () => {
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await service.setPasswordResetToken("user-1", "a-hash", expiresAt);

      expect(repo.update).toHaveBeenCalledWith("user-1", {
        passwordResetTokenHash: "a-hash",
        passwordResetExpiresAt: expiresAt,
      });
    });
  });

  describe("findByPasswordResetTokenHash", () => {
    it("looks up the user by the stored token hash", async () => {
      const user = baseUser();
      repo.findOne.mockResolvedValue(user);

      const result = await service.findByPasswordResetTokenHash("a-hash");

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { passwordResetTokenHash: "a-hash" },
      });
      expect(result).toBe(user);
    });
  });

  describe("resetPassword", () => {
    it("hashes the new password and clears the reset token fields", async () => {
      const user = baseUser({
        passwordResetTokenHash: "old-hash",
        passwordResetExpiresAt: new Date(),
      });

      await service.resetPassword(user, "NewStrongPassword456");

      const savedUser = (repo.save as jest.Mock).mock.calls[0][0] as User;
      expect(
        await bcrypt.compare("NewStrongPassword456", savedUser.password),
      ).toBe(true);
      expect(savedUser.passwordResetTokenHash).toBeNull();
      expect(savedUser.passwordResetExpiresAt).toBeNull();
    });
  });
});
