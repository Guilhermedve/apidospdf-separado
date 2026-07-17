import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
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
export class PdfService implements OnModuleDestroy {
  // Lançar o Chromium é a etapa mais cara da geração (dezenas de segundos na
  // Pi), então o browser é reutilizado entre jobs; cada job abre só uma page.
  private browserPromise?: Promise<PdfBrowser>;

  constructor(
    @Inject(PDF_BROWSER_LAUNCHER)
    private readonly launcher: PdfBrowserLauncher,
    private readonly storage: ReportStorageService,
  ) {}

  async generate(jobId: string, html: string): Promise<StoredReport> {
    // Valida o jobId e resolve o caminho dentro do diretório de storage.
    const temporaryPath = this.storage.temporaryPath(jobId);

    let page: PdfPage | undefined;

    try {
      // Garante o diretório antes da impressão: o Puppeteer grava o arquivo
      // temporário e o commit (que também cria o diretório) só ocorre depois.
      await this.storage.ensureReady();
      page = await this.openPage();

      try {
        await page.setContent(html);
        await page.pdf({
          path: temporaryPath,
          format: 'A4',
          landscape: true,
          printBackground: true,
        });
      } catch (cause) {
        // O browser pode ter ficado em estado inconsistente; descarta para o
        // próximo job relançar do zero.
        await this.discardBrowser();
        throw cause;
      }

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
      await page?.close().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.discardBrowser();
  }

  private getBrowser(): Promise<PdfBrowser> {
    // Cacheia a promise (não o browser) para que jobs concorrentes aguardem o
    // mesmo launch em vez de abrir instâncias paralelas do Chromium.
    this.browserPromise ??= this.launcher.launch().catch((error) => {
      this.browserPromise = undefined;
      throw error;
    });
    return this.browserPromise;
  }

  private async openPage(): Promise<PdfPage> {
    const browser = await this.getBrowser();
    try {
      return await browser.newPage();
    } catch {
      // Browser reutilizado pode ter morrido desde o último job (crash, OOM).
      await this.discardBrowser();
      const fresh = await this.getBrowser();
      return await fresh.newPage();
    }
  }

  private async discardBrowser(): Promise<void> {
    const pending = this.browserPromise;
    this.browserPromise = undefined;
    if (!pending) return;
    try {
      const browser = await pending;
      await browser.close();
    } catch {
      // Browser já indisponível; nada a fechar.
    }
  }
}
