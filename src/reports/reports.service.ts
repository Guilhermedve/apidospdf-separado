import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { ApplicationError } from '../common/errors/application-error';
import type { Clock } from '../datapool/datapool.types';
import type {
  CreateReportCommand,
  PublicReportStatus,
  QueuedReport,
} from './report-job.types';
import { ReportStorageService } from '../storage/report-storage.service';
import { presentReportStatus } from './report-status.presenter';
import {
  REPORTS_CLOCK,
  REPORTS_QUEUE_PROVIDER,
  type ReportsQueue,
} from './reports.queue';

@Injectable()
export class ReportsService {
  constructor(
    @Inject(REPORTS_QUEUE_PROVIDER) private readonly queue: ReportsQueue,
    @Inject(REPORTS_CLOCK) private readonly clock: Clock,
    @Optional() private readonly storage?: ReportStorageService,
  ) {}

  async create(command: CreateReportCommand): Promise<QueuedReport> {
    const job = await this.queue.add({
      ...command,
      requestedAt: this.clock.now().toISOString(),
    });

    return {
      jobId: job.id,
      status: 'queued',
      statusUrl: `/reports/${encodeURIComponent(job.id)}`,
      expiresInMinutes: 30,
    };
  }

  async getStatus(jobId: string): Promise<PublicReportStatus> {
    const snapshot = await this.queue.getStatus(jobId);
    if (!snapshot) {
      throw new ApplicationError(
        'REPORT_NOT_FOUND',
        `Report job ${jobId} was not found`,
        false,
      );
    }

    return presentReportStatus(snapshot);
  }

  async download(jobId: string): Promise<{
    stream: Readable;
    fileName: string;
  }> {
    if (!/^[A-Za-z0-9_-]+$/.test(jobId)) {
      throw new ApplicationError(
        'INVALID_REQUEST',
        'Report job id contains unsafe characters',
        false,
      );
    }
    const snapshot = await this.queue.getStatus(jobId);
    if (!snapshot) {
      throw new ApplicationError(
        'REPORT_NOT_FOUND',
        `Report job ${jobId} was not found`,
        false,
      );
    }
    if (
      snapshot.state !== 'ready' ||
      !snapshot.result ||
      !this.storage
    ) {
      throw new ApplicationError(
        'REPORT_NOT_READY',
        `Report job ${jobId} is not ready`,
        false,
      );
    }
    if (Date.parse(snapshot.result.expiresAt) <= this.clock.now().getTime()) {
      throw new ApplicationError(
        'REPORT_EXPIRED',
        `Report job ${jobId} expired`,
        false,
      );
    }
    return {
      stream: await this.storage.open(jobId),
      fileName: snapshot.result.fileName,
    };
  }
}
