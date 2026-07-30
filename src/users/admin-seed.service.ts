import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "./users.service";
import { UserRole } from "./entities/user.entity";

@Injectable()
export class AdminSeedService implements OnModuleInit {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = this.configService.get<string>("ADMIN_EMAIL");
    const password = this.configService.get<string>("ADMIN_PASSWORD");
    if (!email || !password) {
      this.logger.warn(
        "ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping admin account seed",
      );
      return;
    }

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      return;
    }

    await this.usersService.create("Admin", email, password, UserRole.ADMIN);
    this.logger.log(`Seeded admin account: ${email}`);
  }
}
