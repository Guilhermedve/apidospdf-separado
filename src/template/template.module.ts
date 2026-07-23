import { Module } from '@nestjs/common';
import { BatteryModule } from '../battery/battery.module';
import { ReportDataBuilder } from './report-data.builder';
import { ReportDocumentService } from './report-document.service';
import { ReportHtmlRenderer } from './report-html.renderer';

@Module({
  imports: [BatteryModule],
  providers: [
    ReportDocumentService,
    ReportHtmlRenderer,
    ReportDataBuilder,
  ],
  exports: [
    ReportDocumentService,
    ReportHtmlRenderer,
    ReportDataBuilder,
  ],
})
export class TemplateModule {}
