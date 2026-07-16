import { Test } from '@nestjs/testing';
import { DatapoolClient } from '../../../src/datapool/datapool.client';
import { DatapoolModule } from '../../../src/datapool/datapool.module';

describe('DatapoolModule', () => {
  it('disponibiliza um cliente com fetch e relógio de produção', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatapoolModule],
    })
      .overrideProvider('APP_CONFIG')
      .useValue({
        port: 3000,
        datapoolBaseUrl: 'https://datapool.example.ts.net',
        datapoolTimeoutMs: 60_000,
        datapoolMaxAgeMinutes: 180,
        datapoolUser: 'admin',
        datapoolPassword: '',
        redisUrl: 'redis://redis:6379',
        reportsStoragePath: './storage/reports',
        reportRetentionMinutes: 30,
        reportWorkerConcurrency: 2,
        pdfTimeoutMs: 60_000,
      })
      .compile();

    expect(moduleRef.get(DatapoolClient)).toBeInstanceOf(DatapoolClient);

    await moduleRef.close();
  });
});
