import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import type {
  PdfBrowser,
  PdfBrowserLauncher,
  PdfPage,
  PdfRenderOptions,
} from './pdf.adapters';

// Contratos mínimos do Puppeteer usados aqui. Evitam depender dos tipos do
// pacote em tempo de compilação, já que ele é carregado dinamicamente.
interface PuppeteerPage {
  setContent(
    html: string,
    options: { waitUntil: 'load'; timeout: number },
  ): Promise<unknown>;
  pdf(options: {
    path: string;
    format: 'A4';
    landscape: boolean;
    printBackground: boolean;
    timeout: number;
  }): Promise<unknown>;
  close(): Promise<unknown>;
}

interface PuppeteerBrowser {
  newPage(): Promise<PuppeteerPage>;
  close(): Promise<unknown>;
}

interface PuppeteerModule {
  launch(options: {
    args: string[];
    headless: boolean;
  }): Promise<PuppeteerBrowser>;
}

@Injectable()
export class PuppeteerPdfBrowserLauncher implements PdfBrowserLauncher {
  constructor(private readonly config: AppConfigService) {}

  async launch(): Promise<PdfBrowser> {
    const puppeteer = await this.loadPuppeteer();
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true,
    });

    return new PuppeteerBrowserAdapter(browser, this.config.value.pdfTimeoutMs);
  }

  private async loadPuppeteer(): Promise<PuppeteerModule> {
    const imported = (await import('puppeteer')) as unknown as {
      default?: PuppeteerModule;
    } & PuppeteerModule;
    return imported.default ?? imported;
  }
}

class PuppeteerBrowserAdapter implements PdfBrowser {
  constructor(
    private readonly browser: PuppeteerBrowser,
    private readonly timeoutMs: number,
  ) {}

  async newPage(): Promise<PdfPage> {
    const page = await this.browser.newPage();
    return new PuppeteerPageAdapter(page, this.timeoutMs);
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}

class PuppeteerPageAdapter implements PdfPage {
  constructor(
    private readonly page: PuppeteerPage,
    private readonly timeoutMs: number,
  ) {}

  async setContent(html: string): Promise<void> {
    await this.page.setContent(html, {
      waitUntil: 'load',
      timeout: this.timeoutMs,
    });
  }

  async pdf(options: PdfRenderOptions): Promise<void> {
    await this.page.pdf({ ...options, timeout: this.timeoutMs });
  }

  async close(): Promise<void> {
    await this.page.close();
  }
}
