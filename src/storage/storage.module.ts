import { Module } from '@nestjs/common';
import { AppConfigurationModule } from '../config/config.module';
import type { Clock } from '../datapool/datapool.types';
import { ExpiredReportCleanerService } from './expired-report-cleaner.service';
import { ReportStorageService } from './report-storage.service';

@Module({
  imports: [AppConfigurationModule],
  providers: [
    {
      provide: 'STORAGE_CLOCK',
      useValue: { now: () => new Date() } satisfies Clock,
    },
    ReportStorageService,
    ExpiredReportCleanerService,
  ],
  exports: [ReportStorageService, ExpiredReportCleanerService],
})
export class StorageModule {}
