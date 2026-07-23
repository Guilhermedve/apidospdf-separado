import type { ReportPeriod } from '../datapool/datapool.types';

export type DashboardStatus = 'OK' | 'ATENCAO' | 'CRITICO' | 'SEM_DADOS';

export interface DashboardDailyHealth {
  day: string;
  dayScore: number;
  diagnosis: string;
}

export interface DeviceCardViewModel {
  addr: string;
  hasDataInPeriod: boolean;
  samplesInPeriod: number;
  classification: 'AUTOMACAO' | 'SENSORIAMENTO';
  primaryFunctionLabel: string;
  powerType: 'SOLAR' | 'FONTE';
  performance: number;
  minimumVoltage: number;
  status: DashboardStatus;
  diagnosis: string;
  confidence: string;
  reason: string;
  daily: DashboardDailyHealth[];
}

export interface ReportSummaryViewModel {
  totalDevices: number;
  healthyDevices: number;
  attentionDevices: number;
  criticalDevices: number;
  noDataDevices: number;
  overallHealth: number;
  automationDevices: number;
  sensingDevices: number;
}

export interface ReportViewModel {
  title: string;
  farm: string;
  period: ReportPeriod;
  periodLabel: string;
  generatedAt: string;
  generatedAtLabel: string;
  summary: ReportSummaryViewModel;
  automationDevices: DeviceCardViewModel[];
  sensingDevices: DeviceCardViewModel[];
}
