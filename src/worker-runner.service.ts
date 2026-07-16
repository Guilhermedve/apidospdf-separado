import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { UnrecoverableError, Worker } from 'bullmq';
import Redis from 'ioredis';
import { ApplicationError } from './common/errors/application-error';
import { AppConfigService } from './config/app-config.service';
import type { GenerateReportJobData, ReportArtifactMetadata } from './reports/report-job.types';
import { ReportProcessor } from './reports/report.processor';
import { REPORT_QUEUE } from './reports/reports.queue';

@Injectable()
export class WorkerRunnerService implements OnModuleInit, OnModuleDestroy {
  private connection?: Redis;
  private worker?: Worker<GenerateReportJobData, ReportArtifactMetadata>;

  constructor(
    private readonly config: AppConfigService,
    private readonly processor: ReportProcessor,
  ) {}

  onModuleInit(): void {
    this.connection = new Redis(this.config.value.redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.worker = new Worker(
      REPORT_QUEUE,
      async (job) => {
        try {
          return await this.processor.process(job);
        } catch (error) {
          if (error instanceof ApplicationError && !error.retryable) {
            throw new UnrecoverableError(error.message);
          }
          throw error;
        }
      },
      {
        connection: this.connection,
        concurrency: this.config.value.reportWorkerConcurrency,
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
