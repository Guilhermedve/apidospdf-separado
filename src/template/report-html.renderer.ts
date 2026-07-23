import { Injectable } from '@nestjs/common';
import { renderDetailedReportHtml } from '../pdf/report-detailed.html';
import { renderSimpleReportHtml } from '../pdf/report-simple.html';
import type {
  DetailedReportData,
  SimpleReportData,
} from './report-data.types';

@Injectable()
export class ReportHtmlRenderer {
  renderSimple(data: SimpleReportData): string {
    return renderSimpleReportHtml(data);
  }

  renderDetailed(data: DetailedReportData): string {
    return renderDetailedReportHtml(data);
  }
}
