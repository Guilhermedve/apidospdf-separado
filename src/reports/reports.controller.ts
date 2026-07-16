import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import type {
  PublicReportStatus,
  QueuedReport,
} from './report-job.types';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  create(@Body() dto: CreateReportDto): Promise<QueuedReport> {
    return this.reportsService.create(dto);
  }

  @Get(':jobId')
  getStatus(@Param('jobId') jobId: string): Promise<PublicReportStatus> {
    return this.reportsService.getStatus(jobId);
  }

  @Get(':jobId/download')
  async download(@Param('jobId') jobId: string): Promise<StreamableFile> {
    const report = await this.reportsService.download(jobId);
    return new StreamableFile(report.stream, {
      type: 'application/pdf',
      disposition: `attachment; filename="${report.fileName}"`,
    });
  }
}
