import { Injectable } from '@nestjs/common';
import { renderReportHtml } from '../pdf/report-html';
import { adaptViewModelToLegacyReport } from './legacy-report.adapter';
import type { ReportViewModel } from './report-view-model.types';

@Injectable()
export class ReportHtmlRenderer {
  render(viewModel: ReportViewModel): string {
    return renderReportHtml(adaptViewModelToLegacyReport(viewModel));
  }
}
