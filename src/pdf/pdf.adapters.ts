export const PDF_BROWSER_LAUNCHER = Symbol('PDF_BROWSER_LAUNCHER');
export const PDF_FILE_SYSTEM = Symbol('PDF_FILE_SYSTEM');

export interface PdfRenderOptions {
  path: string;
  format: 'A4';
  landscape: boolean;
  printBackground: boolean;
}

export interface PdfPage {
  setContent(html: string): Promise<void>;
  pdf(options: PdfRenderOptions): Promise<void>;
  close(): Promise<void>;
}

export interface PdfBrowser {
  newPage(): Promise<PdfPage>;
  close(): Promise<void>;
}

export interface PdfBrowserLauncher {
  launch(): Promise<PdfBrowser>;
}

export interface PdfFileSystem {
  mkdir(path: string, options: { recursive: true }): Promise<unknown>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string, options: { force: true }): Promise<void>;
}
