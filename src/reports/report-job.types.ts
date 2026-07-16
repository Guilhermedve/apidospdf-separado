import type { ErrorCode } from '../common/errors/error-codes';
import type { ReportPeriod } from '../datapool/datapool.types';

export interface CreateReportCommand {
  farmSlug: string;
  period: ReportPeriod;
  deviceAddrs?: string[];
}

export interface GenerateReportJobData extends CreateReportCommand {
  requestedAt: string;
}

export interface QueuedReport {
  jobId: string;
  status: 'queued';
  statusUrl: string;
  expiresInMinutes: 30;
}

export type ReportJobState =
  | 'queued'
  | 'fetching-data'
  | 'processing-data'
  | 'rendering-html'
  | 'generating-pdf'
  | 'ready'
  | 'failed'
  | 'expired';

export interface ReportArtifactMetadata {
  fileName: string;
  generatedAt: string;
  expiresAt: string;
}

export interface ReportJobSnapshot {
  jobId: string;
  state: ReportJobState;
  result?: ReportArtifactMetadata;
  errorCode?: ErrorCode;
  internalError?: string;
}

export interface PublicReportStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  downloadUrl?: string;
  generatedAt?: string;
  expiresAt?: string;
  errorCode?: ErrorCode;
  message?: string;
}
