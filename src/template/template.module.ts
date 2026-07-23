import { Module } from '@nestjs/common';
import { BatteryModule } from '../battery/battery.module';
import { ReportDataBuilder } from './report-data.builder';
import { ReportDocumentService } from './report-document.service';
import { ReportHtmlRenderer } from './report-html.renderer';
import { ReportViewModelBuilder } from './report-view-model.builder';

@Module({
  imports: [BatteryModule],
  providers: [
    ReportDocumentService,
    ReportDataBuilder,
    ReportHtmlRenderer,
    ReportViewModelBuilder,
  ],
  exports: [
    ReportDocumentService,
    ReportDataBuilder,
    ReportHtmlRenderer,
    ReportViewModelBuilder,
  ],
})
export class TemplateModule {}
