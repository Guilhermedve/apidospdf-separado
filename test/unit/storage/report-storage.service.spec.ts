import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppConfigService } from '../../../src/config/app-config.service';
import type { AppConfig } from '../../../src/config/app-config.schema';
import type { Clock } from '../../../src/datapool/datapool.types';
import { ReportStorageService } from '../../../src/storage/report-storage.service';

describe('ReportStorageService', () => {
  const root = join(process.cwd(), 'tmp', 'storage-unit');
  let now: Date;
  let storage: ReportStorageService;

  beforeEach(async () => {
    await rm(root, { force: true, recursive: true });
    await mkdir(root, { recursive: true });
    now = new Date('2026-07-10T15:00:00.000Z');
    const clock: Clock = { now: () => now };
    storage = new ReportStorageService(configService(root), clock);
  });

  afterAll(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it.each(['../x', 'a/b', 'a\\b', '.', '', 'á']) (
    'rejeita jobId inseguro: %s',
    (jobId) => {
      expect(() => storage.finalPath(jobId)).toThrow(
        expect.objectContaining({ code: 'INVALID_REQUEST' }),
      );
    },
  );

  it('renomeia o temporário e calcula expiração em 30 minutos', async () => {
    await writeFile(storage.temporaryPath('job-123'), Buffer.from('%PDF-test'));

    const stored = await storage.commit('job-123');

    expect(stored).toEqual({
      fileName: 'job-123.pdf',
      generatedAt: '2026-07-10T15:00:00.000Z',
      expiresAt: '2026-07-10T15:30:00.000Z',
    });
    await expect(readFile(storage.finalPath('job-123'), 'utf8')).resolves.toBe(
      '%PDF-test',
    );
    await expect(
      readFile(storage.temporaryPath('job-123'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('abre o PDF sem renovar sua expiração', async () => {
    await writeFile(storage.temporaryPath('job-123'), Buffer.from('%PDF-test'));
    const stored = await storage.commit('job-123');
    now = new Date('2026-07-10T15:20:00.000Z');

    const stream = await storage.open('job-123');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));

    expect(Buffer.concat(chunks).toString()).toBe('%PDF-test');
    expect(stored.expiresAt).toBe('2026-07-10T15:30:00.000Z');
  });
});

function configService(root: string): AppConfigService {
  const config: AppConfig = {
    port: 3000,
    apiKeys: ['test-key'],
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
