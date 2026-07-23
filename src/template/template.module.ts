import { Module } from '@nestjs/common';
import { BatteryModule } from '../battery/battery.module';
import { ReportDocumentService } from './report-document.service';
import { ReportHtmlRenderer } from './report-html.renderer';
import { ReportViewModelBuilder } from './report-view-model.builder';

@Module({
  imports: [BatteryModule],
  providers: [
    ReportDocumentService,
    ReportHtmlRenderer,
    ReportViewModelBuilder,
  ],
  exports: [
    ReportDocumentService,
    ReportHtmlRenderer,
    ReportViewModelBuilder,
  ],
})
export class TemplateModule {}
