import { Injectable } from '@nestjs/common';
import { mkdir, rename, rm } from 'node:fs/promises';
import type {
  PdfBrowser,
  PdfBrowserLauncher,
  PdfFileSystem,
} from './pdf.adapters';

// Puppeteer ships as ESM. Under `module: commonjs`, a bare `import('puppeteer')`
// downlevels to `require('puppeteer')`, and Jest's CJS sandbox cannot evaluate
// the ESM entry (a real-browser smoke test would fail to load it). Resolving
// through the *genuine* builtin `module` (via `process.getBuiltinModule`, which
// bypasses Jest's module registry) yields Node's native `require`, relying on
// Node 22+ `require(esm)` support identically in tests and at runtime.
const nativeRequire = process
  .getBuiltinModule('module')
  .createRequire(__filename);

@Injectable()
export class PuppeteerPdfBrowserLauncher implements PdfBrowserLauncher {
  async launch(): Promise<PdfBrowser> {
    const puppeteerModule = nativeRequire('puppeteer') as {
      default?: typeof import('puppeteer').default;
    } & typeof import('puppeteer').default;
    const puppeteer = puppeteerModule.default ?? puppeteerModule;
    return (await puppeteer.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        // /dev/shm é pequeno em containers; sem isso o Chromium pode travar.
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--no-first-run',
        '--no-default-browser-check',
        '--mute-audio',
        '--hide-scrollbars',
      ],
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
