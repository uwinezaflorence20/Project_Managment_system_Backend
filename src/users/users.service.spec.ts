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
});
