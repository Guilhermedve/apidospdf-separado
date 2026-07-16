import { z } from 'zod';

const positiveInteger = z.coerce.number().int().positive();
const apiKeys = z.string().transform((value, context) => {
  const keys = value
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
  if (!keys.length) {
    context.addIssue({ code: 'custom', message: 'API_KEYS must not be empty' });
    return z.NEVER;
  }
  return Array.from(new Set(keys));
});

const appConfigSchema = z.object({
  PORT: positiveInteger.max(65_535),
  API_KEYS: apiKeys,
  DATAPOOL_BASE_URL: z
    .string()
    .url()
    .transform((value) => value.replace(/\/+$/, '')),
  DATAPOOL_TIMEOUT_MS: positiveInteger,
  DATAPOOL_MAX_AGE_MINUTES: positiveInteger,
  DATAPOOL_USER: z.string().trim().min(1).default('admin'),
  DATAPOOL_PASSWORD: z.string().default(''),
  REDIS_URL: z.string().url(),
  REPORTS_STORAGE_PATH: z.string().trim().min(1),
  REPORT_RETENTION_MINUTES: z.literal('30').transform(Number),
  REPORT_WORKER_CONCURRENCY: positiveInteger,
  PDF_TIMEOUT_MS: positiveInteger,
});

export interface AppConfig {
  port: number;
  apiKeys: string[];
  datapoolBaseUrl: string;
  datapoolTimeoutMs: number;
  datapoolMaxAgeMinutes: number;
  datapoolUser: string;
  datapoolPassword: string;
  redisUrl: string;
  reportsStoragePath: string;
  reportRetentionMinutes: 30;
  reportWorkerConcurrency: number;
  pdfTimeoutMs: number;
}

export function parseAppConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = appConfigSchema.parse({
    PORT: env.PORT,
    API_KEYS: env.API_KEYS,
    DATAPOOL_BASE_URL: env.DATAPOOL_BASE_URL,
    DATAPOOL_TIMEOUT_MS: env.DATAPOOL_TIMEOUT_MS,
    DATAPOOL_MAX_AGE_MINUTES: env.DATAPOOL_MAX_AGE_MINUTES,
    DATAPOOL_USER: env.DATAPOOL_USER,
    DATAPOOL_PASSWORD: env.DATAPOOL_PASSWORD,
    REDIS_URL: env.REDIS_URL,
    REPORTS_STORAGE_PATH: env.REPORTS_STORAGE_PATH,
    REPORT_RETENTION_MINUTES: env.REPORT_RETENTION_MINUTES,
    REPORT_WORKER_CONCURRENCY: env.REPORT_WORKER_CONCURRENCY,
    PDF_TIMEOUT_MS: env.PDF_TIMEOUT_MS,
  });

  return {
    port: parsed.PORT,
    apiKeys: parsed.API_KEYS,
    datapoolBaseUrl: parsed.DATAPOOL_BASE_URL,
    datapoolTimeoutMs: parsed.DATAPOOL_TIMEOUT_MS,
    datapoolMaxAgeMinutes: parsed.DATAPOOL_MAX_AGE_MINUTES,
    datapoolUser: parsed.DATAPOOL_USER,
    datapoolPassword: parsed.DATAPOOL_PASSWORD,
    redisUrl: parsed.REDIS_URL,
    reportsStoragePath: parsed.REPORTS_STORAGE_PATH,
    reportRetentionMinutes: parsed.REPORT_RETENTION_MINUTES as 30,
    reportWorkerConcurrency: parsed.REPORT_WORKER_CONCURRENCY,
    pdfTimeoutMs: parsed.PDF_TIMEOUT_MS,
  };
}
