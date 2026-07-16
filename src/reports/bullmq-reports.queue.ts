import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import Redis from 'ioredis';
import { AppConfigService } from '../config/app-config.service';
import type { ErrorCode } from '../common/errors/error-codes';
import type {
  GenerateReportJobData,
  ReportArtifactMetadata,
  ReportJobSnapshot,
  ReportJobState,
} from './report-job.types';
import {
  GENERATE_REPORT_JOB,
  REPORT_QUEUE,
  type ReportsQueue,
} from './reports.queue';

@Injectable()
export class BullMqReportsQueue implements ReportsQueue, OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<GenerateReportJobData, ReportArtifactMetadata>;

  constructor(config: AppConfigService) {
    this.connection = new Redis(config.value.redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue(REPORT_QUEUE, { connection: this.connection });
  }

  async add(data: GenerateReportJobData): Promise<{ id: string }> {
    const job = await this.queue.add(GENERATE_REPORT_JOB, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { age: 60 * 60 },
      removeOnFail: { age: 60 * 60 },
    });
    return { id: String(job.id) };
  }

  async getStatus(jobId: string): Promise<ReportJobSnapshot | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();

    if (state === 'completed') {
      return { jobId, state: 'ready', result: job.returnvalue };
    }
    if (state === 'failed') {
      const failure = this.parseFailure(job);
      return { jobId, state: 'failed', ...failure };
    }
    if (state === 'active') {
      return { jobId, state: this.progressState(job.progress) };
    }
    return { jobId, state: 'queued' };
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }

  private progressState(progress: Job['progress']): ReportJobState {
    return typeof progress === 'string' &&
      [
        'fetching-data',
        'processing-data',
        'rendering-html',
        'generating-pdf',
      ].includes(progress)
      ? (progress as ReportJobState)
      : 'processing-data';
  }

  private parseFailure(job: Job): {
    errorCode: ErrorCode;
    internalError?: string;
  } {
    try {
      const parsed = JSON.parse(job.failedReason) as {
        code?: ErrorCode;
        message?: string;
      };
      if (parsed.code) {
        return { errorCode: parsed.code, internalError: parsed.message };
      }
    } catch {}
    return {
      errorCode: 'PDF_GENERATION_FAILED',
      internalError: job.failedReason,
    };
  }
}
