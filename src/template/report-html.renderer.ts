import { Injectable } from '@nestjs/common';
import { renderReportHtml } from '../pdf/report-html';
import { renderSimpleReportHtml } from '../pdf/report-simple.html';
import { adaptViewModelToLegacyReport } from './legacy-report.adapter';
import type { SimpleReportData } from './report-data.types';
import type { ReportViewModel } from './report-view-model.types';

@Injectable()
export class ReportHtmlRenderer {
  renderSimple(data: SimpleReportData): string {
    return renderSimpleReportHtml(data);
  }

  render(viewModel: ReportViewModel): string {
    return renderReportHtml(adaptViewModelToLegacyReport(viewModel));
  }
}
