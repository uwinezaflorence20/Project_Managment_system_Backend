import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { UsersModule } from "./users/users.module";
import { AuthModule } from "./auth/auth.module";
import { BoardsModule } from "./boards/boards.module";
import { ColumnsModule } from "./columns/columns.module";
import { TasksModule } from "./tasks/tasks.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { AdminModule } from "./admin/admin.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: "postgres" as const,
        host: configService.get<string>("DB_HOST"),
        port: configService.get<number>("DB_PORT"),
        username: configService.get<string>("DB_USERNAME"),
        password: configService.get<string>("DB_PASSWORD"),
        database: configService.get<string>("DB_NAME"),
        autoLoadEntities: true,
        synchronize: configService.get<string>("DB_SYNCHRONIZE") === "true",
      }),
    }),
    UsersModule,
    AuthModule,
    RealtimeModule,
    BoardsModule,
    ColumnsModule,
    TasksModule,
    AdminModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
