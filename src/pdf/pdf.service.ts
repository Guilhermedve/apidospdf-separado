import { Inject, Injectable } from '@nestjs/common';
import { ApplicationError } from '../common/errors/application-error';
import {
  ReportStorageService,
  type StoredReport,
} from '../storage/report-storage.service';
import {
  PDF_BROWSER_LAUNCHER,
  type PdfBrowser,
  type PdfBrowserLauncher,
  type PdfPage,
} from './pdf.adapters';

@Injectable()
export class PdfService {
  constructor(
    @Inject(PDF_BROWSER_LAUNCHER)
    private readonly launcher: PdfBrowserLauncher,
    private readonly storage: ReportStorageService,
  ) {}

  async generate(jobId: string, html: string): Promise<StoredReport> {
    // Valida o jobId e resolve o caminho dentro do diretório de storage.
    const temporaryPath = this.storage.temporaryPath(jobId);

    let browser: PdfBrowser | undefined;
    let page: PdfPage | undefined;

    try {
      // Garante o diretório antes da impressão: o Puppeteer grava o arquivo
      // temporário e o commit (que também cria o diretório) só ocorre depois.
      await this.storage.ensureReady();
      browser = await this.launcher.launch();
      page = await browser.newPage();

      await page.setContent(html);
      await page.pdf({
        path: temporaryPath,
        format: 'A4',
        landscape: true,
        printBackground: true,
      });

      return await this.storage.commit(jobId);
    } catch (cause) {
      await this.storage.remove(jobId);
      throw new ApplicationError(
        'PDF_GENERATION_FAILED',
        `Failed to generate PDF for report ${jobId}`,
        true,
        { cause },
      );
    } finally {
      await Promise.allSettled([page?.close(), browser?.close()]);
    }
  }
}
