import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { ClockModule } from './common/clock/clock.module';
import { AppLoggerModule } from './common/logging/logger.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CatalogModule } from './catalog/catalog.module';
import { LibraryModule } from './library/library.module';
import { TrackingModule } from './tracking/tracking.module';

@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    ClockModule,
    DatabaseModule,
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    CatalogModule,
    LibraryModule,
    TrackingModule,
  ],
})
export class AppModule {}
