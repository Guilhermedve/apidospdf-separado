import { mkdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppConfigService } from '../../../src/config/app-config.service';
import type { AppConfig } from '../../../src/config/app-config.schema';
import type { Clock } from '../../../src/datapool/datapool.types';
import { ExpiredReportCleanerService } from '../../../src/storage/expired-report-cleaner.service';
import { ReportStorageService } from '../../../src/storage/report-storage.service';

describe('ExpiredReportCleanerService', () => {
  const root = join(process.cwd(), 'tmp', 'storage-integration');
  let now = new Date('2026-07-10T15:00:00.000Z');
  const clock: Clock = { now: () => now };
  let storage: ReportStorageService;
  let cleaner: ExpiredReportCleanerService;

  beforeEach(async () => {
    await rm(root, { force: true, recursive: true });
    await mkdir(root, { recursive: true });
    storage = new ReportStorageService(configService(root), clock);
    cleaner = new ExpiredReportCleanerService(storage, clock);
  });

  afterAll(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it('remove PDF expirado e temporário abandonado, preservando o novo', async () => {
    await writeFile(storage.temporaryPath('old-job'), '%PDF-old');
    await storage.commit('old-job');

    await writeFile(storage.temporaryPath('orphan-job'), 'partial');
    const oldDate = new Date('2026-07-10T15:00:00.000Z');
    await utimes(storage.temporaryPath('orphan-job'), oldDate, oldDate);

    now = new Date('2026-07-10T15:31:00.000Z');
    await writeFile(storage.temporaryPath('new-job'), '%PDF-new');
    await storage.commit('new-job');

    await expect(cleaner.cleanNow()).resolves.toBe(2);
    await expect(stat(storage.finalPath('old-job'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      stat(storage.temporaryPath('orphan-job')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(storage.finalPath('new-job'))).resolves.toBeDefined();
  });
});

function configService(root: string): AppConfigService {
  const config: AppConfig = {
    apiKeys: ['test-key'],
    port: 3000,
    datapoolBaseUrl: 'https://datapool.example.ts.net',
    datapoolTimeoutMs: 60_000,
    datapoolMaxAgeMinutes: 180,
    datapoolUser: 'admin',
    datapoolPassword: '',
    redisUrl: 'redis://redis:6379',
    reportsStoragePath: root,
    reportRetentionMinutes: 30,
    reportWorkerConcurrency: 2,
    pdfTimeoutMs: 60_000,
  };
  return new AppConfigService(config);
}
