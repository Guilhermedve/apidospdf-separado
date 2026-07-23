import type { Job } from 'bullmq';
import type { DatapoolClient } from '../../../src/datapool/datapool.client';
import type { DatapoolPeriodDocument } from '../../../src/datapool/datapool.types';
import type { PdfService } from '../../../src/pdf/pdf.service';
import { ReportProcessor } from '../../../src/reports/report.processor';
import type {
  GenerateReportJobData,
  ReportArtifactMetadata,
} from '../../../src/reports/report-job.types';
import type { ReportDocumentService } from '../../../src/template/report-document.service';

const document = { unit: 'entre-rios' } as unknown as DatapoolPeriodDocument;

const artifact: ReportArtifactMetadata = {
  fileName: 'report.pdf',
  generatedAt: '2026-07-23T12:00:00.000Z',
  expiresAt: '2026-07-23T12:30:00.000Z',
};

function createFakes() {
  const datapool = {
    getPeriod: jest.fn().mockResolvedValue(document),
  } as unknown as jest.Mocked<DatapoolClient>;
  const documents = {
    render: jest.fn().mockReturnValue('<html></html>'),
  } as unknown as jest.Mocked<ReportDocumentService>;
  const pdf = {
    generate: jest.fn().mockResolvedValue(artifact),
  } as unknown as jest.Mocked<PdfService>;

  return { datapool, documents, pdf };
}

function fakeJob(data: GenerateReportJobData): Job<GenerateReportJobData> {
  return {
    id: 'job-1',
    data,
    updateProgress: jest.fn().mockResolvedValue(undefined),
  } as unknown as Job<GenerateReportJobData>;
}

describe('ReportProcessor', () => {
  it('renderiza a variante simple solicitada', async () => {
    const { datapool, documents, pdf } = createFakes();
    const processor = new ReportProcessor(datapool, documents, pdf);

    await processor.process(
      fakeJob({
        farmSlug: 'entre-rios',
        period: '3d',
        deviceAddrs: ['045'],
        reportType: 'simple',
        requestedAt: '2026-07-23T12:00:00.000Z',
      }),
    );

    expect(documents.render).toHaveBeenCalledWith(document, ['045'], 'simple');
  });

  it('trata um job antigo sem variante como detailed', async () => {
    const { datapool, documents, pdf } = createFakes();
    const processor = new ReportProcessor(datapool, documents, pdf);

    const legacyData = {
      farmSlug: 'entre-rios',
      period: '3d',
      requestedAt: '2026-07-23T12:00:00.000Z',
    } as unknown as GenerateReportJobData;

    await processor.process(fakeJob(legacyData));

    expect(documents.render).toHaveBeenCalledWith(
      document,
      undefined,
      'detailed',
    );
  });
});
