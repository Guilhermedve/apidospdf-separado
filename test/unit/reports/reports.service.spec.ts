import type { Clock } from '../../../src/datapool/datapool.types';
import type { ReportJobSnapshot } from '../../../src/reports/report-job.types';
import type { ReportsQueue } from '../../../src/reports/reports.queue';
import { ReportsService } from '../../../src/reports/reports.service';

class InMemoryReportsQueue implements ReportsQueue {
  private sequence = 0;
  readonly added: unknown[] = [];
  readonly snapshots = new Map<string, ReportJobSnapshot>();

  async add(data: unknown): Promise<{ id: string }> {
    this.added.push(data);
    this.sequence += 1;
    return { id: `job-${this.sequence}` };
  }

  async getStatus(jobId: string): Promise<ReportJobSnapshot | null> {
    return this.snapshots.get(jobId) ?? null;
  }
}

describe('ReportsService', () => {
  const clock: Clock = {
    now: () => new Date('2026-07-10T15:00:00.000Z'),
  };

  it('cria um job novo com payload mínimo', async () => {
    const queue = new InMemoryReportsQueue();
    const service = new ReportsService(queue, clock);

    const created = await service.create({
      farmSlug: 'entre-rios',
      period: '3d',
      deviceAddrs: ['045'],
    });

    expect(created).toEqual({
      jobId: 'job-1',
      status: 'queued',
      statusUrl: '/reports/job-1',
      expiresInMinutes: 30,
    });
    expect(queue.added).toEqual([
      {
        farmSlug: 'entre-rios',
        period: '3d',
        deviceAddrs: ['045'],
        requestedAt: '2026-07-10T15:00:00.000Z',
      },
    ]);
  });

  it('não deduplica solicitações idênticas', async () => {
    const queue = new InMemoryReportsQueue();
    const service = new ReportsService(queue, clock);
    const command = { farmSlug: 'entre-rios', period: '3d' as const };

    const first = await service.create(command);
    const second = await service.create(command);

    expect(first.jobId).not.toBe(second.jobId);
  });

  it('apresenta o estado retornado pela fila', async () => {
    const queue = new InMemoryReportsQueue();
    queue.snapshots.set('job-1', {
      jobId: 'job-1',
      state: 'processing-data',
    });
    const service = new ReportsService(queue, clock);

    await expect(service.getStatus('job-1')).resolves.toEqual({
      jobId: 'job-1',
      status: 'processing',
    });
  });

  it('falha com código estável quando o job não existe', async () => {
    const service = new ReportsService(new InMemoryReportsQueue(), clock);

    await expect(service.getStatus('missing')).rejects.toEqual(
      expect.objectContaining({
        code: 'REPORT_NOT_FOUND',
        retryable: false,
      }),
    );
  });
});
