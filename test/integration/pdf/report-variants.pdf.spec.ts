import { readFileSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { BatteryAnalysisService } from '../../../src/battery/battery-analysis.service';
import { BatteryReportMapper } from '../../../src/battery/battery-report.mapper';
import { DeviceSelectionService } from '../../../src/battery/device-selection.service';
import type { AppConfig } from '../../../src/config/app-config.schema';
import { AppConfigService } from '../../../src/config/app-config.service';
import type { Clock } from '../../../src/datapool/datapool.types';
import { parseDatapoolPeriodDocument } from '../../../src/datapool/datapool.schema';
import { renderSimpleReportHtml } from '../../../src/pdf/report-simple.html';
import { PdfService } from '../../../src/pdf/pdf.service';
import { PuppeteerPdfBrowserLauncher } from '../../../src/pdf/pdf.providers';
import { ReportDataBuilder } from '../../../src/template/report-data.builder';
import type { SimpleReportData } from '../../../src/template/report-data.types';
import { ReportDocumentService } from '../../../src/template/report-document.service';
import { ReportHtmlRenderer } from '../../../src/template/report-html.renderer';
import { ReportViewModelBuilder } from '../../../src/template/report-view-model.builder';
import { ReportStorageService } from '../../../src/storage/report-storage.service';

jest.setTimeout(120_000);

const root = join(process.cwd(), 'tmp', 'pdf-variants-integration');
const now = new Date('2026-07-10T15:00:00.000Z');
const clock: Clock = { now: () => now };
const document = parseDatapoolPeriodDocument(
  JSON.parse(
    readFileSync(
      join(process.cwd(), 'test', 'fixtures', 'datapool', 'entre-rios-3d.json'),
      'utf8',
    ),
  ),
);

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
    const html = createReportService().render(document, undefined, 'detailed');
    await pdf.generate('detailed-smoke', html);

    const bytes = await readFile(storage.finalPath('detailed-smoke'));
    expect(bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1_000);
  });
});

function createReportService(): ReportDocumentService {
  return new ReportDocumentService(
    new DeviceSelectionService(),
    new BatteryReportMapper(new BatteryAnalysisService()),
    new ReportViewModelBuilder(),
    new ReportDataBuilder(),
    new ReportHtmlRenderer(),
  );
}

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
