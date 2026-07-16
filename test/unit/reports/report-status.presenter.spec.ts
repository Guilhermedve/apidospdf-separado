import { presentReportStatus } from '../../../src/reports/report-status.presenter';
import type { ReportJobSnapshot } from '../../../src/reports/report-job.types';

describe('presentReportStatus', () => {
  it('inclui download e expiração somente quando pronto', () => {
    const snapshot: ReportJobSnapshot = {
      jobId: 'job-123',
      state: 'ready',
      result: {
        fileName: 'job-123.pdf',
        generatedAt: '2026-07-10T15:00:00.000Z',
        expiresAt: '2026-07-10T15:30:00.000Z',
      },
    };

    expect(presentReportStatus(snapshot)).toEqual({
      jobId: 'job-123',
      status: 'done',
      downloadUrl: '/reports/job-123/download',
      generatedAt: '2026-07-10T15:00:00.000Z',
      expiresAt: '2026-07-10T15:30:00.000Z',
    });
  });

  it('converte falha em mensagem pública sem causa interna', () => {
    const snapshot: ReportJobSnapshot = {
      jobId: 'job-456',
      state: 'failed',
      errorCode: 'DATAPOOL_UNAVAILABLE',
      internalError: 'fetch https://private-host failed with token=secret',
    };

    const presented = presentReportStatus(snapshot);

    expect(presented).toEqual({
      jobId: 'job-456',
      status: 'failed',
      errorCode: 'DATAPOOL_UNAVAILABLE',
      message: 'Os dados da fazenda estão temporariamente indisponíveis.',
    });
    expect(JSON.stringify(presented)).not.toContain('private-host');
    expect(JSON.stringify(presented)).not.toContain('secret');
  });

  it('apresenta progresso sem campos de download', () => {
    expect(
      presentReportStatus({ jobId: 'job-789', state: 'fetching-data' }),
    ).toEqual({
      jobId: 'job-789',
      status: 'processing',
    });
  });
});
