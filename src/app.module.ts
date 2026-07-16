import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ActuatorExcelModule } from './actuator-excel/actuator-excel.module';
import { ApiKeyGuard } from './auth/api-key.guard';
import { AppConfigurationModule } from './config/config.module';
import { DatapoolModule } from './datapool/datapool.module';
import { HealthModule } from './health/health.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    AppConfigurationModule,
    DatapoolModule,
    HealthModule,
    ReportsModule,
    ActuatorExcelModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AppModule {}
