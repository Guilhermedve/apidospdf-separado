import { Controller, Get } from '@nestjs/common';
import { DatapoolClient } from './datapool.client';
import type { FarmDiscovery } from './datapool.schema';

@Controller('farms')
export class FarmsController {
  constructor(private readonly datapoolClient: DatapoolClient) {}

  @Get()
  getFarms(): Promise<FarmDiscovery> {
    return this.datapoolClient.getFarms();
  }
}
