import { Module } from '@nestjs/common';
import { AppConfigurationModule } from '../config/config.module';
import type { Clock } from '../datapool/datapool.types';
import { StorageModule } from '../storage/storage.module';
import { BullMqReportsQueue } from './bullmq-reports.queue';
import { ReportsController } from './reports.controller';
import {
  REPORTS_CLOCK,
  REPORTS_QUEUE_PROVIDER,
} from './reports.queue';
import { ReportsService } from './reports.service';

@Module({
  imports: [AppConfigurationModule, StorageModule],
  controllers: [ReportsController],
  providers: [
    BullMqReportsQueue,
    { provide: REPORTS_QUEUE_PROVIDER, useExisting: BullMqReportsQueue },
    {
      provide: REPORTS_CLOCK,
      useValue: { now: () => new Date() } satisfies Clock,
    },
    ReportsService,
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
