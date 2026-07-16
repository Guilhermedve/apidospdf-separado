import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApplicationError } from '../../../src/common/errors/application-error';
import type { AppConfig } from '../../../src/config/app-config.schema';
import { AppConfigService } from '../../../src/config/app-config.service';
import type { Clock } from '../../../src/datapool/datapool.types';
import type {
  PdfBrowser,
  PdfBrowserLauncher,
  PdfPage,
  PdfRenderOptions,
} from '../../../src/pdf/pdf.adapters';
import { PdfService } from '../../../src/pdf/pdf.service';
import { ReportStorageService } from '../../../src/storage/report-storage.service';

describe('PdfService', () => {
  const root = join(process.cwd(), 'tmp', 'pdf-integration');
  const now = new Date('2026-07-10T15:00:00.000Z');
  const clock: Clock = { now: () => now };
  let storage: ReportStorageService;

  beforeEach(async () => {
    await rm(root, { force: true, recursive: true });
    storage = new ReportStorageService(configService(root), clock);
  });

  afterAll(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it('imprime o HTML no caminho temporário e promove para o PDF final', async () => {
    const launcher = new FakeLauncher();
    const service = new PdfService(launcher, storage);

    const result = await service.generate('42', '<html>ok</html>');

    expect(result).toMatchObject({
      fileName: '42.pdf',
      generatedAt: now.toISOString(),
    });
    expect(launcher.page.receivedHtml).toBe('<html>ok</html>');
    expect(launcher.page.renderOptions).toMatchObject({
      format: 'A4',
      landscape: true,
      printBackground: true,
    });
    await expect(
      readFile(storage.finalPath('42'), 'utf8'),
    ).resolves.toBe('%PDF-fake');
    expect(launcher.closed).toBe(true);
    expect(launcher.page.closed).toBe(true);
  });

  it('remove o temporário e lança PDF_GENERATION_FAILED quando a impressão falha', async () => {
    const launcher = new FakeLauncher({ failOnPdf: true });
    const service = new PdfService(launcher, storage);

    await expect(service.generate('7', '<html/>')).rejects.toMatchObject({
      code: 'PDF_GENERATION_FAILED',
    });
    await expect(
      service.generate('7', '<html/>').catch((error) => error),
    ).resolves.toBeInstanceOf(ApplicationError);
    await expect(stat(storage.temporaryPath('7'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(stat(storage.finalPath('7'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(launcher.closed).toBe(true);
  });
});

class FakePage implements PdfPage {
  receivedHtml?: string;
  renderOptions?: PdfRenderOptions;
  closed = false;

  constructor(private readonly failOnPdf: boolean) {}

  async setContent(html: string): Promise<void> {
    this.receivedHtml = html;
  }

  async pdf(options: PdfRenderOptions): Promise<void> {
    this.renderOptions = options;
    if (this.failOnPdf) {
      throw new Error('boom');
    }
    await writeFile(options.path, '%PDF-fake');
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

class FakeLauncher implements PdfBrowserLauncher {
  readonly page: FakePage;
  closed = false;

  constructor(options: { failOnPdf?: boolean } = {}) {
    this.page = new FakePage(options.failOnPdf ?? false);
  }

  async launch(): Promise<PdfBrowser> {
    const page = this.page;
    return {
      newPage: async () => page,
      close: async () => {
        this.closed = true;
      },
    };
  }
}

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
