import type { ReportPeriod } from '../datapool/datapool.types';

export type ReportOverallStatus = 'OK' | 'ATENCAO' | 'CRITICO' | 'SEM_DADOS';

export interface ReportHeaderData {
  title: string;
  unitName: string;
  period: ReportPeriod;
  periodLabel: string;
  windowStartLabel: string;
  windowEndLabel: string;
  generatedAt: string;
  generatedAtLabel: string;
  reportId: string;
}

export interface ReportSummaryData {
  overallStatus: ReportOverallStatus;
  totalDevices: number;
  healthyDevices: number;
  attentionDevices: number;
  criticalDevices: number;
  noDataDevices: number;
  totalAlerts: number;
  overallHealth: number | null;
}

export interface ReportKpiData {
  totalSamples: number;
  automationDevices: number;
  sensingDevices: number;
}

export interface ReportConclusionData {
  title: string;
  body: string;
  recommendations: string[];
}

export interface SimpleReportData {
  header: ReportHeaderData;
  summary: ReportSummaryData;
  kpis: ReportKpiData;
  conclusion: ReportConclusionData;
}

export interface DailyTelemetryData {
  day: string;
  dayLabel: string;
  sampleCount: number;
  minimumVoltage: number | null;
  maximumVoltage: number | null;
  averageVoltage: number | null;
  diagnosis: string;
  healthScore: number | null;
}

export interface DetailedDeviceData {
  addr: string;
  classification: 'AUTOMACAO' | 'SENSORIAMENTO';
  functionLabel: string;
  model: string;
  powerType: string;
  status: ReportOverallStatus;
  diagnosis: string;
  confidence: string;
  reason: string;
  sampleCount: number;
  minimumVoltage: number | null;
  maximumVoltage: number | null;
  averageVoltage: number | null;
  dailyTelemetry: DailyTelemetryData[];
}

export type TechnicalEventKind =
  | 'DEVICE_ERROR'
  | 'DIAGNOSTIC'
  | 'NOTE'
  | 'HEALTH_FLAG'
  | 'BROWNOUT'
  | 'CHARGE_TREND';

export interface TechnicalEventData {
  deviceAddr: string;
  kind: TechnicalEventKind;
  occurredAt: string | null;
  occurredAtLabel: string;
  severity: 'INFO' | 'ATENCAO' | 'CRITICO';
  message: string;
  count: number;
}

export interface DetailedReportData extends SimpleReportData {
  automationDevices: DetailedDeviceData[];
  sensingDevices: DetailedDeviceData[];
  technicalEvents: TechnicalEventData[];
}
