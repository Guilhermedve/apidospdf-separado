import { Module } from '@nestjs/common';
import { BatteryAnalysisService } from './battery-analysis.service';
import { BatteryReportMapper } from './battery-report.mapper';
import { DeviceSelectionService } from './device-selection.service';

@Module({
  providers: [
    BatteryAnalysisService,
    BatteryReportMapper,
    DeviceSelectionService,
  ],
  exports: [
    BatteryAnalysisService,
    BatteryReportMapper,
    DeviceSelectionService,
  ],
})
export class BatteryModule {}
