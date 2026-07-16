import { Injectable } from '@nestjs/common';
import type {
  DatapoolDevice,
  DatapoolPeriodDocument,
} from '../datapool/datapool.types';
import type { ReportPeriod } from '../datapool/datapool.types';
import { BatteryAnalysisService } from './battery-analysis.service';
import type {
  BatteryHealth,
  BatteryHealthSignals,
  BatteryReportData,
  BatteryReportDevice,
} from './battery-report.types';

@Injectable()
export class BatteryReportMapper {
  constructor(private readonly analysis: BatteryAnalysisService) {}

  map(
    document: DatapoolPeriodDocument,
    selectedDevices: DatapoolDevice[],
  ): BatteryReportData {
    return {
      farm: document.farm,
      period: document.period,
      generatedAt: document.generatedAt,
      windowStart: document.windowStart,
      windowEnd: document.windowEnd,
      devices: selectedDevices.map((device) =>
        this.mapDevice(
          device,
          document.period,
          document.windowStart,
          document.windowEnd,
        ),
      ),
      sourceSummary: structuredClone(document.summary),
    };
  }

  private mapDevice(
    device: DatapoolDevice,
    period: ReportPeriod,
    windowStart: string,
    windowEnd: string,
  ): BatteryReportDevice {
    const windowStartMs = Date.parse(windowStart);
    const windowEndMs = Date.parse(windowEnd);
    const rowsInPeriod = device.raw.filter((row) => {
      const timeMs = Date.parse(row.time);
      return (
        Number.isFinite(timeMs) &&
        timeMs >= windowStartMs &&
        timeMs <= windowEndMs &&
        Number.isFinite(row.bat)
      );
    });

    const base: BatteryReportDevice = {
      addr: String(device.addr).padStart(3, '0'),
      hasDataInPeriod: rowsInPeriod.length > 0,
      samplesInPeriod: rowsInPeriod.length,
      table: device.table,
      model: device.model,
      modelType: device.modelType,
      classification: device.classification,
      primaryFunctionLabel: device.primaryFunctionLabel,
      status: device.status,
      errorMessage: device.errorMessage,
      stats: structuredClone(device.stats),
      health: structuredClone(device.health),
      legacy: structuredClone(device.legacy),
      raw: structuredClone(rowsInPeriod).sort(
        (left, right) => Date.parse(left.time) - Date.parse(right.time),
      ),
    };

    if (device.status !== 'ready') {
      return base;
    }

    // Recompute from `raw` when possible; a controlled analyzer failure or an
    // unanalyzable device falls back to the remote diagnosis for this device
    // only, without affecting the rest of the report.
    let local: ReturnType<BatteryAnalysisService['analyze']>;
    try {
      local = this.analysis.analyze({
        raw: base.raw,
        modelType: device.modelType,
        period,
        windowEnd,
      });
    } catch {
      return base;
    }

    if (!local) {
      return base;
    }

    return {
      ...base,
      health: this.assembleHealth(local.health, device.health),
      legacy: local.legacy,
    };
  }

  // The local analyzer owns the diagnosis fields; `flags` and `signals` are
  // orthogonal remote signals not present in the reference algorithm, so they
  // are preserved from the remote diagnosis instead of fabricated.
  private assembleHealth(
    computed: Omit<BatteryHealth, 'flags' | 'signals'>,
    remote: BatteryHealth,
  ): BatteryHealth {
    const health: BatteryHealth = {
      ...computed,
      flags: structuredClone(remote.flags ?? []),
    };

    const signals = this.preserveSignals(remote.signals);
    if (signals) {
      health.signals = signals;
    }

    return health;
  }

  private preserveSignals(
    remote: BatteryHealthSignals | undefined,
  ): BatteryHealthSignals | undefined {
    if (!remote || !remote.brownout || !remote.chargeTrend) {
      return undefined;
    }

    // A null/non-finite slope is an absent signal from the source; never coerce
    // it to zero to satisfy the local contract.
    if (!Number.isFinite(remote.chargeTrend.slopePerDay)) {
      return undefined;
    }

    return structuredClone(remote);
  }
}
