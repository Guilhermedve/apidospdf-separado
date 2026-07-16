import { Injectable } from '@nestjs/common';
import { mkdir, rename, rm } from 'node:fs/promises';
import type {
  PdfBrowser,
  PdfBrowserLauncher,
  PdfFileSystem,
} from './pdf.adapters';

@Injectable()
export class PuppeteerPdfBrowserLauncher implements PdfBrowserLauncher {
  async launch(): Promise<PdfBrowser> {
    const { default: puppeteer } = await import('puppeteer');
    return (await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true,
    })) as unknown as PdfBrowser;
  }
}

@Injectable()
export class NodePdfFileSystem implements PdfFileSystem {
  mkdir(
    path: string,
    options: { recursive: true },
  ): Promise<string | undefined> {
    return mkdir(path, options);
  }

  rename(from: string, to: string): Promise<void> {
    return rename(from, to);
  }

  rm(path: string, options: { force: true }): Promise<void> {
    return rm(path, options);
  }
}
