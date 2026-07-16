import { Module } from '@nestjs/common';
import { AppConfigurationModule } from '../config/config.module';
import { DatapoolClient } from './datapool.client';
import { FarmsController } from './farms.controller';
import type { Clock, DatapoolFetch } from './datapool.types';

@Module({
  imports: [AppConfigurationModule],
  controllers: [FarmsController],
  providers: [
    {
      provide: 'DATAPOOL_FETCH',
      useValue: globalThis.fetch.bind(globalThis) as DatapoolFetch,
    },
    {
      provide: 'DATAPOOL_CLOCK',
      useValue: { now: () => new Date() } satisfies Clock,
    },
    DatapoolClient,
  ],
  exports: [DatapoolClient],
})
export class DatapoolModule {}
