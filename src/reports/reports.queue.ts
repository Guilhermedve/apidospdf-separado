import type {
  GenerateReportJobData,
  ReportJobSnapshot,
} from './report-job.types';

export const REPORT_QUEUE = 'battery-pdf-reports';
export const GENERATE_REPORT_JOB = 'generate-battery-pdf';
export const REPORTS_QUEUE_PROVIDER = 'REPORTS_QUEUE_PROVIDER';
export const REPORTS_CLOCK = 'REPORTS_CLOCK';

export interface ReportsQueue {
  add(data: GenerateReportJobData): Promise<{ id: string }>;
  getStatus(jobId: string): Promise<ReportJobSnapshot | null>;
}
