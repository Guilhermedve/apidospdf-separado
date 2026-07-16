import { Test } from '@nestjs/testing';
import { ExpiredReportCleanerService } from '../../../src/storage/expired-report-cleaner.service';
import { ReportStorageService } from '../../../src/storage/report-storage.service';
import { StorageModule } from '../../../src/storage/storage.module';

describe('StorageModule', () => {
  it('registra storage e cleaner com um relógio compartilhado', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [StorageModule] })
      .overrideProvider('APP_CONFIG')
      .useValue({
        port: 3000,
        datapoolBaseUrl: 'https://datapool.example.ts.net',
        datapoolTimeoutMs: 60_000,
        datapoolMaxAgeMinutes: 180,
        datapoolUser: 'admin',
        datapoolPassword: '',
        redisUrl: 'redis://redis:6379',
        reportsStoragePath: './tmp/storage-module',
        reportRetentionMinutes: 30,
        reportWorkerConcurrency: 2,
        pdfTimeoutMs: 60_000,
      })
      .compile();

    expect(moduleRef.get(ReportStorageService)).toBeInstanceOf(
      ReportStorageService,
    );
    expect(moduleRef.get(ExpiredReportCleanerService)).toBeInstanceOf(
      ExpiredReportCleanerService,
    );
    await moduleRef.close();
  });
});
