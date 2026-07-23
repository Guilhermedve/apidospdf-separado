import { Injectable } from '@nestjs/common';
import { renderReportHtml } from '../pdf/report-html';
import { adaptViewModelToLegacyReport } from './legacy-report.adapter';
import type { ReportViewModel } from './report-view-model.types';

@Injectable()
export class ReportHtmlRenderer {
  renderSimple(viewModel: ReportViewModel): string {
    return renderReportHtml(adaptViewModelToLegacyReport(viewModel), {
      heatmapMode: 'unified',
    });
  }

  render(viewModel: ReportViewModel): string {
    return renderReportHtml(adaptViewModelToLegacyReport(viewModel));
  }
}
