import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig } from '../../../src/config/app-config.schema';
import { AppConfigService } from '../../../src/config/app-config.service';
import type { Clock } from '../../../src/datapool/datapool.types';
import { renderDetailedReportHtml } from '../../../src/pdf/report-detailed.html';
import { renderSimpleReportHtml } from '../../../src/pdf/report-simple.html';
import { PdfService } from '../../../src/pdf/pdf.service';
import { PuppeteerPdfBrowserLauncher } from '../../../src/pdf/pdf.providers';
import type {
  DetailedReportData,
  SimpleReportData,
} from '../../../src/template/report-data.types';
import { ReportStorageService } from '../../../src/storage/report-storage.service';

jest.setTimeout(120_000);

const root = join(process.cwd(), 'tmp', 'pdf-variants-integration');
const now = new Date('2026-07-10T15:00:00.000Z');
const clock: Clock = { now: () => now };

function header(title: string): SimpleReportData['header'] {
  return {
    title,
    unitName: 'fazenda exemplo',
    period: '3d',
    periodLabel: 'Últimos 3 dias',
    windowStartLabel: '07/07/2026 10:00',
    windowEndLabel: '10/07/2026 10:00',
    generatedAt: now.toISOString(),
    generatedAtLabel: '10/07/2026 12:00',
    reportId: 'fazenda-3d-20260710',
  };
}

const simpleData: SimpleReportData = {
  header: header('Relatório executivo de baterias'),
  summary: {
    overallStatus: 'OK',
    totalDevices: 2,
    healthyDevices: 2,
    attentionDevices: 0,
    criticalDevices: 0,
    noDataDevices: 0,
    totalAlerts: 0,
    overallHealth: 100,
  },
  kpis: { totalSamples: 24, automationDevices: 1, sensingDevices: 1 },
  conclusion: {
    title: 'Frota saudável',
    body: 'Todos os dispositivos analisáveis estão saudáveis.',
    recommendations: ['Manter o monitoramento preventivo periódico.'],
  },
};

const detailedData: DetailedReportData = {
  ...simpleData,
  header: header('Relatório técnico de baterias'),
  automationDevices: [
    {
      addr: '010',
      classification: 'AUTOMACAO',
      functionLabel: 'Atuador',
      model: 'MOD-A',
      powerType: 'FONTE',
      status: 'OK',
      diagnosis: 'NORMAL',
      confidence: 'ALTA',
      reason: 'Operação estável.',
      sampleCount: 12,
      minimumVoltage: 12.9,
      maximumVoltage: 13.8,
      averageVoltage: 13.3,
      dailyTelemetry: [
        {
          day: '2026-07-08',
          dayLabel: '08/07',
          sampleCount: 6,
          minimumVoltage: 12.9,
          maximumVoltage: 13.6,
          averageVoltage: 13.2,
          diagnosis: 'NORMAL',
          healthScore: 92,
        },
        {
          day: '2026-07-09',
          dayLabel: '09/07',
          sampleCount: 6,
          minimumVoltage: 13.0,
          maximumVoltage: 13.8,
          averageVoltage: 13.4,
          diagnosis: 'NORMAL',
          healthScore: 96,
        },
      ],
    },
  ],
  sensingDevices: [
    {
      addr: '045',
      classification: 'SENSORIAMENTO',
      functionLabel: 'Sensor analógico',
      model: 'MOD-S',
      powerType: 'SOLAR',
      status: 'OK',
      diagnosis: 'NORMAL',
      confidence: 'MEDIA',
      reason: 'Sem anomalias.',
      sampleCount: 12,
      minimumVoltage: 12.7,
      maximumVoltage: 13.5,
      averageVoltage: 13.1,
      dailyTelemetry: [
        {
          day: '2026-07-08',
          dayLabel: '08/07',
          sampleCount: 6,
          minimumVoltage: 12.7,
          maximumVoltage: 13.3,
          averageVoltage: 13.0,
          diagnosis: 'NORMAL',
          healthScore: 88,
        },
        {
          day: '2026-07-09',
          dayLabel: '09/07',
          sampleCount: 6,
          minimumVoltage: 12.9,
          maximumVoltage: 13.5,
          averageVoltage: 13.2,
          diagnosis: 'NORMAL',
          healthScore: 90,
        },
      ],
    },
  ],
  technicalEvents: [
    {
      deviceAddr: '045',
      kind: 'NOTE',
      occurredAt: '2026-07-08T08:00:00.000Z',
      occurredAtLabel: '08/07/2026 05:00',
      severity: 'INFO',
      message: 'Reinício manual',
      count: 1,
    },
  ],
};

describe('report variants as PDF', () => {
  let pdf: PdfService;
  let storage: ReportStorageService;

  beforeAll(async () => {
    await rm(root, { force: true, recursive: true });
    storage = new ReportStorageService(configService(root), clock);
    pdf = new PdfService(new PuppeteerPdfBrowserLauncher(), storage);
  });

  afterAll(async () => {
    await pdf.onModuleDestroy();
    await rm(root, { force: true, recursive: true });
  });

  it('gera um PDF executivo válido', async () => {
    await pdf.generate('simple-smoke', renderSimpleReportHtml(simpleData));

    const bytes = await readFile(storage.finalPath('simple-smoke'));
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1_000);
  });

  it('gera um PDF técnico válido', async () => {
    await pdf.generate('detailed-smoke', renderDetailedReportHtml(detailedData));

    const bytes = await readFile(storage.finalPath('detailed-smoke'));
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1_000);
  });
});

function configService(storageRoot: string): AppConfigService {
  const config: AppConfig = {
    apiKeys: ['test-key'],
    port: 3000,
    datapoolBaseUrl: 'https://datapool.example.ts.net',
    datapoolTimeoutMs: 60_000,
    datapoolMaxAgeMinutes: 180,
    datapoolUser: 'admin',
    datapoolPassword: '',
    redisUrl: 'redis://redis:6379',
    reportsStoragePath: storageRoot,
    reportRetentionMinutes: 30,
    reportWorkerConcurrency: 2,
    pdfTimeoutMs: 60_000,
  };
  return new AppConfigService(config);
}
