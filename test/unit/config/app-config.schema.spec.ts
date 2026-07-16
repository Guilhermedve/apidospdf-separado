import { parseAppConfig } from '../../../src/config/app-config.schema';

const validEnv = (
  overrides: Record<string, string> = {},
): NodeJS.ProcessEnv => ({
  PORT: '3000',
  API_KEYS: 'support-key,rotation-key',
  DATAPOOL_BASE_URL: 'https://datapool.example.ts.net',
  DATAPOOL_TIMEOUT_MS: '60000',
  DATAPOOL_MAX_AGE_MINUTES: '180',
  REDIS_URL: 'redis://redis:6379',
  REPORTS_STORAGE_PATH: './storage/reports',
  REPORT_RETENTION_MINUTES: '30',
  REPORT_WORKER_CONCURRENCY: '2',
  PDF_TIMEOUT_MS: '60000',
  ...overrides,
});

describe('parseAppConfig', () => {
  it('rejeita retenção diferente de 30 minutos', () => {
    expect(() =>
      parseAppConfig(validEnv({ REPORT_RETENTION_MINUTES: '60' })),
    ).toThrow('REPORT_RETENTION_MINUTES');
  });

  it('normaliza a URL da datapool sem barra final', () => {
    const config = parseAppConfig(
      validEnv({
        DATAPOOL_BASE_URL: 'https://datapool.example.ts.net/',
      }),
    );

    expect(config.datapoolBaseUrl).toBe(
      'https://datapool.example.ts.net',
    );
  });

  it('converte números e preserva a retenção literal', () => {
    const config = parseAppConfig(validEnv());

    expect(config).toMatchObject({
      port: 3000,
      apiKeys: ['support-key', 'rotation-key'],
      datapoolTimeoutMs: 60_000,
      datapoolMaxAgeMinutes: 180,
      reportRetentionMinutes: 30,
      reportWorkerConcurrency: 2,
      pdfTimeoutMs: 60_000,
    });
  });

  it('rejeita lista vazia de chaves da API', () => {
    expect(() => parseAppConfig(validEnv({ API_KEYS: ' , ' }))).toThrow(
      'API_KEYS',
    );
  });
});
