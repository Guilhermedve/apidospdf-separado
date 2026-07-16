import { Inject, Injectable } from '@nestjs/common';
import type { Clock } from '../datapool/datapool.types';
import { ReportStorageService } from './report-storage.service';

@Injectable()
export class ExpiredReportCleanerService {
  constructor(
    private readonly storage: ReportStorageService,
    @Inject('STORAGE_CLOCK') private readonly clock: Clock,
  ) {}

  cleanNow(): Promise<number> {
    return this.storage.cleanExpired(this.clock.now());
  }
}
