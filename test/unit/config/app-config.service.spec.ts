import { AppConfigService } from '../../../src/config/app-config.service';
import type { AppConfig } from '../../../src/config/app-config.schema';

describe('AppConfigService', () => {
  it('expõe a configuração validada sem permitir substituição', () => {
    const config: AppConfig = {
      port: 3000,
      apiKeys: ['test-key'],
      datapoolBaseUrl: 'https://datapool.example.ts.net',
      datapoolTimeoutMs: 60_000,
      datapoolMaxAgeMinutes: 180,
      datapoolUser: 'admin',
      datapoolPassword: '',
      redisUrl: 'redis://redis:6379',
      reportsStoragePath: './storage/reports',
      reportRetentionMinutes: 30,
      reportWorkerConcurrency: 2,
      pdfTimeoutMs: 60_000,
    };

    const service = new AppConfigService(config);

    expect(service.value).toBe(config);
  });
});
