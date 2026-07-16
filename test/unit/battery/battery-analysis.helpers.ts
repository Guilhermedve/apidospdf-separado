import type {
  BatteryHealth,
  BatteryRawRow,
  LegacyBatteryAnalysis,
} from '../../../src/battery/battery-report.types';
import type {
  DatapoolDevice,
  DatapoolPeriodDocument,
  ReportPeriod,
} from '../../../src/datapool/datapool.types';

// America/Fortaleza is UTC-3 year-round (no DST). To place a sample at a given
// Fortaleza wall-clock day/hour, add the offset when building the UTC instant.
const FORTALEZA_OFFSET_HOURS = 3;

export function fortalezaTime(day: string, hour: number, minute = 0): string {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  return new Date(
    Date.UTC(year, month - 1, dayOfMonth, hour + FORTALEZA_OFFSET_HOURS, minute),
  ).toISOString();
}

export function rawRow(
  time: string,
  bat: number,
  addr = 45,
): BatteryRawRow {
  return {
    time,
    addr,
    version: '',
    rawBat: bat,
    bat,
    ttl: 0,
    ack: 0,
    retry: 0,
    statRf: 0,
    uptime: 0,
    uuid: '00000000-00000000-00000000-00000000',
    note: null,
  };
}

// One sample per entry, spread across daytime Fortaleza hours (6h onward) so
// each stays within the same UTC day.
export function daySamples(
  day: string,
  voltages: number[],
  startHour = 6,
): BatteryRawRow[] {
  return voltages.map((bat, index) =>
    rawRow(fortalezaTime(day, startHour + index, 0), bat),
  );
}

export const HEALTHY_DAY = [
  12.6, 12.7, 13.0, 13.5, 14.0, 14.3, 14.2, 13.8, 13.2, 12.9, 12.8, 12.7,
];

export const WEAK_DAY = [
  12.5, 12.8, 13.5, 14.2, 14.3, 14.0, 13.0, 12.4, 12.0, 11.9, 11.9, 12.0,
];

export const CHARGE_FAIL_DAY = [
  12.5, 12.8, 13.0, 13.4, 13.7, 13.8, 13.6, 13.2, 12.9, 12.7, 12.6, 12.5,
];

// Charged (peaks at 14.2) but spends >50% of the day below 12.1V.
export const EXCESSIVE_DAY = [
  11.8, 11.9, 12.0, 11.7, 14.2, 14.0, 11.9, 11.8, 12.0, 11.9, 11.8, 11.7,
];

export function healthSnapshot(
  overrides: Partial<BatteryHealth> = {},
): BatteryHealth {
  return {
    healthScore: 0,
    lifeStatus: 'ATENCAO',
    diagnosis: 'REMOTO',
    confidence: 'BAIXA',
    reasons: ['diagnostico remoto'],
    validDays: 0,
    daily: [],
    flags: [],
    ...overrides,
  };
}

export function legacySnapshot(
  overrides: Partial<LegacyBatteryAnalysis> = {},
): LegacyBatteryAnalysis {
  return {
    minBat: 0,
    baixaPercent: 0,
    eficiencia: 0,
    ciclos: 0,
    statusBateria: 'REMOTO',
    motivoBateria: 'remoto',
    statusCarga: 'REMOTO',
    motivoCarga: 'remoto',
    performance: 0,
    ...overrides,
  };
}

export function makeDevice(
  overrides: Partial<DatapoolDevice> = {},
): DatapoolDevice {
  const raw = overrides.raw ?? [];
  return {
    addr: 45,
    table: 'LOG_DEV.DEV045',
    model: 'REP',
    modelType: 'SOLAR',
    classification: 'AUTOMACAO',
    primaryFunctionLabel: 'Sensor analogico',
    status: 'ready',
    errorMessage: null,
    stats: {
      totalRows: raw.length,
      validBatteryRows: raw.length,
      minBat: null,
      maxBat: null,
      avgBat: null,
      attentionVoltageRows: 0,
      riskVoltageRows: 0,
      criticalVoltageRows: 0,
      chargedRows: 0,
      minRawBat: null,
      maxRawBat: null,
    },
    health: healthSnapshot(),
    legacy: legacySnapshot(),
    raw,
    ...overrides,
  } as DatapoolDevice;
}

export function makeDocument(
  device: DatapoolDevice,
  overrides: Partial<DatapoolPeriodDocument> = {},
): DatapoolPeriodDocument {
  const addr = String(device.addr).padStart(3, '0');
  return {
    farm: 'fazenda teste',
    period: '3d' as ReportPeriod,
    generatedAt: '2026-07-10T13:00:00.000Z',
    windowStart: '2026-07-07T13:00:00.000Z',
    windowEnd: '2026-07-10T13:00:00.000Z',
    devices: { [addr]: device },
    summary: {
      totalDevices: 1,
      readyDevices: device.status === 'ready' ? 1 : 0,
      failedDevices: device.status === 'ready' ? 0 : 1,
      totalRows: device.raw.length,
    },
    ...overrides,
  } as DatapoolPeriodDocument;
}
