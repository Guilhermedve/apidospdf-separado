import { Module } from '@nestjs/common';
import { DatapoolModule } from './datapool/datapool.module';
import { PdfModule } from './pdf/pdf.module';
import { ReportProcessor } from './reports/report.processor';
import { TemplateModule } from './template/template.module';
import { WorkerRunnerService } from './worker-runner.service';

@Module({
  imports: [DatapoolModule, TemplateModule, PdfModule],
  providers: [ReportProcessor, WorkerRunnerService],
})
export class WorkerModule {}
