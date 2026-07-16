import { Module } from '@nestjs/common';
import { PDF_BROWSER_LAUNCHER, PDF_FILE_SYSTEM } from './pdf.adapters';
import {
  NodePdfFileSystem,
  PuppeteerPdfBrowserLauncher,
} from './pdf.providers';
import { PdfService } from './pdf.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [
    PdfService,
    { provide: PDF_BROWSER_LAUNCHER, useClass: PuppeteerPdfBrowserLauncher },
    { provide: PDF_FILE_SYSTEM, useClass: NodePdfFileSystem },
  ],
  exports: [PdfService],
})
export class PdfModule {}
