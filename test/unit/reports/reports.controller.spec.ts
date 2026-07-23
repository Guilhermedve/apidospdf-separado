import { ReportsController } from '../../../src/reports/reports.controller';
import type { CreateReportDto } from '../../../src/reports/dto/create-report.dto';
import type {
  PublicReportStatus,
  QueuedReport,
} from '../../../src/reports/report-job.types';

class FakeReportsService {
  createdWith?: CreateReportDto;
  statusRequestedFor?: string;

  async create(dto: CreateReportDto): Promise<QueuedReport> {
    this.createdWith = dto;
    return {
      jobId: 'job-1',
      status: 'queued',
      statusUrl: '/reports/job-1',
      expiresInMinutes: 30,
    };
  }

  async getStatus(jobId: string): Promise<PublicReportStatus> {
    this.statusRequestedFor = jobId;
    return { jobId, status: 'processing' };
  }
}

describe('ReportsController', () => {
  it('delega a criação sem consultar dados ou gerar PDF', async () => {
    const service = new FakeReportsService();
    const controller = new ReportsController(service as never);
    const dto: CreateReportDto = {
      farmSlug: 'entre-rios',
      period: '3d',
      deviceAddrs: ['045'],
      reportType: 'detailed',
    };

    await expect(controller.create(dto)).resolves.toMatchObject({
      jobId: 'job-1',
      status: 'queued',
    });
    expect(service.createdWith).toBe(dto);
  });

  it('delega a consulta de status pelo jobId', async () => {
    const service = new FakeReportsService();
    const controller = new ReportsController(service as never);

    await expect(controller.getStatus('job-1')).resolves.toEqual({
      jobId: 'job-1',
      status: 'processing',
    });
    expect(service.statusRequestedFor).toBe('job-1');
  });
});
