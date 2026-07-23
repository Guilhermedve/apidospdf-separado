export type BatteryConfidence = 'BAIXA' | 'MEDIA' | 'ALTA';

export type BatteryDiagnosis =
  | 'NORMAL'
  | 'BATERIA_FRACA'
  | 'FALHA_CARGA'
  | 'DESCARGA_EXCESSIVA'
  | 'BAIXA_TENSAO_RECENTE'
  | 'DADOS_INSUFICIENTES';

export interface BatteryReportItem {
  cliente: string;
  addr: number;
  hasDataInPeriod: boolean;
  samplesInPeriod: number;
  tipo: 'SOLAR' | 'FONTE';
  dir: {
    classification: 'AUTOMACAO' | 'SENSORIAMENTO';
    primaryFunction: { label: string; columns: string[] };
    functions: Array<{ label: string; columns: string[] }>;
    sdiColumns: string[];
  };
  minBat: number;
  motivo: string;
  motivoBateria: string;
  motivoCarga: string;
  health: {
    healthScore: number;
    lifeStatus: 'OK' | 'ATENCAO' | 'CRITICO';
    diagnosis: BatteryDiagnosis;
    confidence: BatteryConfidence;
    reasons: string[];
    daily: Array<{
      day: string;
      dayScore: number;
      diagnosis: BatteryDiagnosis;
    }>;
  };
}

export interface ReportQueryResult {
  days?: number;
  hours?: number;
  generatedAt: string;
  items: BatteryReportItem[];
}
