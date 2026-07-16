import { Module } from '@nestjs/common';
import { AppConfigurationModule } from '../config/config.module';
import type { DatapoolFetch } from '../datapool/datapool.types';
import { ActuatorCacheClient } from './actuator-cache.client';
import { ActuatorExcelController } from './actuator-excel.controller';
import { ActuatorWorkbookService } from './actuator-workbook.service';

@Module({
  imports: [AppConfigurationModule],
  controllers: [ActuatorExcelController],
  providers: [
    {
      provide: 'ACTUATOR_FETCH',
      useValue: globalThis.fetch.bind(globalThis) as DatapoolFetch,
    },
    ActuatorCacheClient,
    ActuatorWorkbookService,
  ],
  exports: [ActuatorCacheClient, ActuatorWorkbookService],
})
export class ActuatorExcelModule {}
