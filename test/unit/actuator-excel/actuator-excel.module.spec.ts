import { Test } from '@nestjs/testing';
import { ActuatorCacheClient } from '../../../src/actuator-excel/actuator-cache.client';
import { ActuatorExcelModule } from '../../../src/actuator-excel/actuator-excel.module';
import { ActuatorWorkbookService } from '../../../src/actuator-excel/actuator-workbook.service';

describe('ActuatorExcelModule', () => {
  it('registra cliente e tradutor de producao', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ActuatorExcelModule],
    })
      .overrideProvider('APP_CONFIG')
      .useValue({
        port: 3000,
        datapoolBaseUrl: 'https://datapool.example',
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

    expect(moduleRef.get(ActuatorCacheClient)).toBeInstanceOf(
      ActuatorCacheClient,
    );
    expect(moduleRef.get(ActuatorWorkbookService)).toBeInstanceOf(
      ActuatorWorkbookService,
    );

    await moduleRef.close();
  });
});
