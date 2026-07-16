import type { ReportPeriod } from '../datapool/datapool.types';

export interface BatteryRawRow {
  time: string;
  addr: number;
  version: string;
  rawBat: number;
  bat: number;
  ttl: number;
  ack: number;
  retry: number;
  statRf: number;
  uptime: number;
  uuid: string;
  note: string | null;
}

export interface BatteryStats {
  totalRows: number;
  validBatteryRows: number;
  minBat: number | null;
  maxBat: number | null;
  avgBat: number | null;
  attentionVoltageRows: number;
  riskVoltageRows: number;
  criticalVoltageRows: number;
  chargedRows: number;
  minRawBat: number | null;
  maxRawBat: number | null;
}

export interface BatteryDailyHealth {
  day: string;
  sampleCount: number;
  minBat: number;
  maxBat: number;
  avgBat: number;
  charged: boolean;
  lowVoltageSamples: number;
  criticalVoltageSamples: number;
  lowVoltagePercent: number;
  overnightDrop: number | null;
  socScore: number;
  deepDischargeSamples: number;
  riskVoltageSamples: number;
  attentionVoltageSamples: number;
  dayScore: number;
  diagnosis: string;
}

export interface BatteryHealthSignals {
  brownout: { resets: number; detected: boolean };
  chargeTrend: { slopePerDay: number | null; days: number; declining: boolean };
}

export interface BatteryHealth {
  healthScore: number;
  lifeStatus: string;
  diagnosis: string;
  confidence: string;
  reasons: string[];
  validDays: number;
  daily: BatteryDailyHealth[];
  flags: string[];
  signals?: BatteryHealthSignals;
}

export interface LegacyBatteryAnalysis {
  minBat: number;
  baixaPercent: number;
  eficiencia: number;
  ciclos: number;
  statusBateria: string;
  motivoBateria: string;
  statusCarga: string;
  motivoCarga: string;
  performance: number;
}

export interface BatteryReportDevice {
  addr: string;
  hasDataInPeriod: boolean;
  samplesInPeriod: number;
  table: string;
  model: string;
  modelType: string;
  classification: string;
  primaryFunctionLabel: string;
  status: string;
  errorMessage: string | null;
  stats: BatteryStats;
  health: BatteryHealth;
  legacy: LegacyBatteryAnalysis | null;
  raw: BatteryRawRow[];
}

export interface BatteryReportData {
  farm: string;
  period: ReportPeriod;
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  devices: BatteryReportDevice[];
  sourceSummary: {
    totalDevices: number;
    readyDevices: number;
    failedDevices: number;
    totalRows: number;
  };
}
