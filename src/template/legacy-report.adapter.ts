import type { DeviceCardViewModel, ReportViewModel } from './report-view-model.types';
import type {
  BatteryConfidence,
  BatteryDiagnosis,
  BatteryReportItem,
  ReportQueryResult,
} from './legacy-report.types';

const diagnoses = new Set<BatteryDiagnosis>([
  'NORMAL',
  'BATERIA_FRACA',
  'FALHA_CARGA',
  'DESCARGA_EXCESSIVA',
  'BAIXA_TENSAO_RECENTE',
  'DADOS_INSUFICIENTES',
]);

const confidences = new Set<BatteryConfidence>(['BAIXA', 'MEDIA', 'ALTA']);

export function adaptViewModelToLegacyReport(
  viewModel: ReportViewModel,
): ReportQueryResult {
  const period =
    viewModel.period === '3h'
      ? { hours: 3 }
      : { days: viewModel.period === '3d' ? 3 : 7 };

  return {
    ...period,
    generatedAt: viewModel.generatedAt,
    items: [
      ...viewModel.automationDevices,
      ...viewModel.sensingDevices,
    ].map((device) => adaptDevice(viewModel.farm, device)),
  };
}

function adaptDevice(
  farm: string,
  device: DeviceCardViewModel,
): BatteryReportItem {
  const reason = device.reason || 'Sem motivo informado.';
  return {
    cliente: farm,
    addr: Number(device.addr),
    hasDataInPeriod: device.hasDataInPeriod,
    samplesInPeriod: device.samplesInPeriod,
    tipo: device.powerType,
    dir: {
      classification: device.classification,
      primaryFunction: {
        label: device.primaryFunctionLabel,
        columns: [],
      },
      functions: [],
      sdiColumns: [],
    },
    minBat: device.minimumVoltage,
    motivo: reason,
    motivoBateria: reason,
    motivoCarga: '',
    health: {
      healthScore: device.performance,
      lifeStatus:
        device.status === 'SEM_DADOS' ? 'ATENCAO' : device.status,
      diagnosis: normalizeDiagnosis(device.diagnosis),
      confidence: normalizeConfidence(device.confidence),
      reasons: device.reason ? [device.reason] : [],
      daily: device.daily.map((day) => ({
        day: day.day,
        dayScore: day.dayScore,
        diagnosis: normalizeDiagnosis(day.diagnosis),
      })),
    },
  };
}

function normalizeDiagnosis(value: string): BatteryDiagnosis {
  return diagnoses.has(value as BatteryDiagnosis)
    ? (value as BatteryDiagnosis)
    : 'DADOS_INSUFICIENTES';
}

function normalizeConfidence(value: string): BatteryConfidence {
  return confidences.has(value as BatteryConfidence)
    ? (value as BatteryConfidence)
    : 'BAIXA';
}
