import type { ReportPeriod } from '../datapool/datapool.types';
import type {
  BatteryDailyHealth,
  BatteryHealth,
  BatteryRawRow,
  LegacyBatteryAnalysis,
} from './battery-report.types';

export type BatteryDiagnosis =
  | 'NORMAL'
  | 'BATERIA_FRACA'
  | 'FALHA_CARGA'
  | 'DESCARGA_EXCESSIVA'
  | 'BAIXA_TENSAO_RECENTE'
  | 'DADOS_INSUFICIENTES';

export type BatteryConfidence = 'BAIXA' | 'MEDIA' | 'ALTA';

export type BatteryLifeStatus = 'OK' | 'ATENCAO' | 'CRITICO';

export type BatteryStatus = 'OK' | 'ATENCAO' | 'CRITICO';

export type ChargeStatus = 'OK' | 'ATENCAO' | 'CRITICO' | 'SEM_DADOS';

export interface SolarAnalysisResult {
  minBat: number;
  baixaPercent: number;
  eficiencia: number;
  ciclos: number;
  statusBateria: BatteryStatus;
  motivoBateria: string;
  statusCarga: ChargeStatus;
  motivoCarga: string;
  performance: number;
}

export interface FonteAnalysisResult {
  minBat: number;
  quedasBruscas: number;
  tempoDescarga: number;
  status: BatteryStatus;
  motivo: string;
  performance: number;
}

export type TypedAnalysisResult =
  | { type: 'SOLAR'; data: SolarAnalysisResult }
  | { type: 'FONTE'; data: FonteAnalysisResult };

// Output of `analyzeHealth` — the period/life-trend summary derived purely from
// `raw`. Orthogonal remote signals (`flags`, `signals`) are attached later by
// the mapper, so they are not part of this shape.
export interface BatteryHealthSummary {
  healthScore: number;
  lifeStatus: BatteryLifeStatus;
  diagnosis: BatteryDiagnosis;
  confidence: BatteryConfidence;
  reasons: string[];
  validDays: number;
  daily: BatteryDailyHealth[];
}

export interface LocalBatteryAnalysisInput {
  raw: BatteryRawRow[];
  modelType: string;
  period: ReportPeriod;
  windowEnd: string;
}

export interface LocalBatteryAnalysisResult {
  health: Omit<BatteryHealth, 'flags' | 'signals'>;
  legacy: LegacyBatteryAnalysis;
}
