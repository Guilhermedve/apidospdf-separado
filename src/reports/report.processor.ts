import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ApplicationError } from '../common/errors/application-error';
import { DatapoolClient } from '../datapool/datapool.client';
import { PdfService } from '../pdf/pdf.service';
import { ReportDocumentService } from '../template/report-document.service';
import type {
  GenerateReportJobData,
  ReportArtifactMetadata,
} from './report-job.types';

@Injectable()
export class ReportProcessor {
  constructor(
    private readonly datapool: DatapoolClient,
    private readonly documents: ReportDocumentService,
    private readonly pdf: PdfService,
  ) {}

  async process(
    job: Job<GenerateReportJobData>,
  ): Promise<ReportArtifactMetadata> {
    try {
      await job.updateProgress('fetching-data');
      const document = await this.datapool.getPeriod(
        job.data.farmSlug,
        job.data.period,
      );
      await job.updateProgress('processing-data');
      await job.updateProgress('rendering-html');
      const html = this.documents.render(document, job.data.deviceAddrs);
      await job.updateProgress('generating-pdf');
      return await this.pdf.generate(String(job.id), html);
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw new Error(
          JSON.stringify({ code: error.code, message: error.message }),
          { cause: error },
        );
      }
      throw error;
    }
  }
}
