import { Injectable } from '@nestjs/common';
import type { ReportPeriod } from '../datapool/datapool.types';
import type {
  BatteryConfidence,
  BatteryDiagnosis,
  BatteryHealthSummary,
  BatteryLifeStatus,
  BatteryStatus,
  ChargeStatus,
  FonteAnalysisResult,
  LocalBatteryAnalysisInput,
  LocalBatteryAnalysisResult,
  SolarAnalysisResult,
} from './battery-analysis.types';
import type {
  BatteryDailyHealth,
  BatteryRawRow,
  LegacyBatteryAnalysis,
} from './battery-report.types';

type NormalizedBatteryLog = {
  time: Date;
  bat: number;
  hour: number;
  day: string;
};

type PeriodBatteryAssessment = {
  status: BatteryStatus;
  reason: string;
};

type HealthAnalysisOptions = {
  shortWindow?: boolean;
  periodHours?: number;
  periodDays?: number;
};

const MIN_FAILURE_DAYS = 7;
const ATTENTION_MAX_VOLTAGE = 13;
const CRITICAL_MAX_VOLTAGE = 12;
const SHORT_WINDOW_CRITICAL_VOLTAGE = 12;

// ---- Health-score / battery-life thresholds -------------------------------
const HEALTH_MIN_SAMPLES_DAY = 10; // valid day for long (life) analysis
const HEALTH_MIN_SAMPLES_SHORT = 3; // valid day for a short (hours) window
const LOW_VOLTAGE = 12.1; // discharged threshold
const CRITICAL_VOLTAGE = 11.8; // deep-discharge / sulfation risk
const CHARGE_VOLTAGE = 14.0; // "reached full charge" trigger
const CHARGE_INCOMPLETE_VOLTAGE = 13.5; // strong charge-failure signal
const STRONG_OVERNIGHT_DROP = 1.2;
const RECURRENCE_DAYS = 3; // a pattern must repeat to claim a trend
const SHORT_WINDOW_MAX_HEALTH_SCORE = 69;

const REPORT_TIME_ZONE = 'America/Fortaleza';

// Ported from the reference `battery-analysis.service.ts` (repo root). Four
// deliberate adaptations for the PDF pipeline (see spec):
//   1. input is `BatteryRawRow` (ISO string time) instead of `DeviceBatteryLog`;
//   2. hour/day are derived in America/Fortaleza, not the container time zone;
//   3. relative-day references ("yesterday", "last 7 days") anchor to the
//      document `windowEnd`, not the process clock;
//   4. model routing uses the already-normalized `device.modelType`.
// All thresholds, bands, weights and diagnoses are kept identical.
@Injectable()
export class BatteryAnalysisService {
  private readonly partsFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Recalculates `health` and `legacy` for a single device from its `raw`
  // rows. Returns null to signal the mapper to fall back to the remote
  // diagnosis (unknown model, no usable data, or too little to analyze).
  analyze(input: LocalBatteryAnalysisInput): LocalBatteryAnalysisResult | null {
    const modelType = this.resolveModelType(input.modelType);
    if (!modelType) {
      return null;
    }

    const options = this.periodToOptions(input.period);
    const referenceDay = this.toDayKey(new Date(input.windowEnd));

    const health = this.analyzeHealth(input.raw, options);
    if (health.validDays === 0) {
      return null;
    }

    if (modelType === 'SOLAR') {
      const data = this.analyzeSolar(input.raw, options.shortWindow, referenceDay);
      if (!data) {
        return null;
      }
      return { health, legacy: this.solarToLegacy(data) };
    }

    const data = this.analyzeFonte(input.raw, options.shortWindow, referenceDay);
    if (!data) {
      return null;
    }
    return { health, legacy: this.fonteToLegacy(data) };
  }

  private resolveModelType(modelType: string): 'SOLAR' | 'FONTE' | null {
    const normalized = modelType.trim().toUpperCase();
    if (normalized === 'SOLAR') return 'SOLAR';
    if (normalized === 'FONTE') return 'FONTE';
    return null;
  }

  private periodToOptions(period: ReportPeriod): {
    shortWindow: boolean;
    periodHours?: number;
    periodDays?: number;
  } {
    if (period === '3h') {
      return { shortWindow: true, periodHours: 3 };
    }
    if (period === '7d') {
      return { shortWindow: false, periodDays: 7 };
    }
    return { shortWindow: false, periodDays: 3 };
  }

  private solarToLegacy(data: SolarAnalysisResult): LegacyBatteryAnalysis {
    return { ...data };
  }

  private fonteToLegacy(data: FonteAnalysisResult): LegacyBatteryAnalysis {
    return {
      minBat: data.minBat,
      baixaPercent: 0,
      eficiencia: 0,
      ciclos: 0,
      statusBateria: data.status,
      motivoBateria: data.motivo,
      statusCarga: 'SEM_DADOS',
      motivoCarga: 'Regra diaria solar nao se aplica a FONTE',
      performance: data.performance,
    };
  }

  // Period/life-trend diagnosis built from per-day behavior. Independent from
  // the legacy minBat-anchored analysis so the old fields keep working while
  // consumers migrate to the richer `health` summary.
  analyzeHealth(
    raw: BatteryRawRow[],
    options: HealthAnalysisOptions = {},
  ): BatteryHealthSummary {
    const shortWindow = this.isRecentWindow(options);
    const normalized = this.normalizeLogs(raw);
    const minSamples = shortWindow
      ? HEALTH_MIN_SAMPLES_SHORT
      : HEALTH_MIN_SAMPLES_DAY;

    const byDay = new Map<string, NormalizedBatteryLog[]>();
    for (const log of normalized) {
      const bucket = byDay.get(log.day);
      if (bucket) {
        bucket.push(log);
      } else {
        byDay.set(log.day, [log]);
      }
    }

    const dayKeys = Array.from(byDay.keys()).sort();
    const daily: BatteryDailyHealth[] = [];
    for (const day of dayKeys) {
      const dayLogs = byDay.get(day)!;
      if (dayLogs.length < minSamples) {
        continue;
      }
      daily.push(this.computeDailyHealth(day, dayLogs, byDay));
    }

    if (!daily.length) {
      return {
        healthScore: 0,
        lifeStatus: 'ATENCAO',
        diagnosis: 'DADOS_INSUFICIENTES',
        confidence: 'BAIXA',
        reasons: ['Dados insuficientes para estimar tendencia de vida util.'],
        validDays: 0,
        daily: [],
      };
    }

    const validDays = daily.length;
    const rawHealthScore = this.aggregateHealthScore(daily);
    const confidence = this.classifyConfidence(shortWindow, validDays, options);
    let { diagnosis, reasons } = this.diagnosePeriod(
      daily,
      shortWindow,
      confidence,
    );
    const healthScore = this.adjustHealthScore(rawHealthScore, diagnosis, {
      shortWindow,
    });
    const lifeStatus = this.classifyLifeStatus(healthScore);

    if (shortWindow && diagnosis === 'NORMAL') {
      diagnosis = 'DADOS_INSUFICIENTES';
      reasons = [
        'Janela curta: tensao recente nao estima saude da bateria.',
        ...reasons,
      ];
    }

    return {
      healthScore,
      lifeStatus,
      diagnosis,
      confidence,
      reasons,
      validDays,
      daily,
    };
  }

  private isRecentWindow(options: HealthAnalysisOptions): boolean {
    if (!options.shortWindow) return false;
    return options.periodHours === undefined || options.periodHours < 24;
  }

  private adjustHealthScore(
    healthScore: number,
    diagnosis: BatteryDiagnosis,
    options: { shortWindow: boolean },
  ): number {
    let adjusted = healthScore;
    if (options.shortWindow) {
      adjusted = Math.min(adjusted, SHORT_WINDOW_MAX_HEALTH_SCORE);
    }
    if (diagnosis !== 'NORMAL') {
      adjusted = Math.min(adjusted, SHORT_WINDOW_MAX_HEALTH_SCORE);
    }
    return this.round(adjusted, 1);
  }

  // Legacy (days) analysis anchors the minimum-voltage reference to the day
  // before `windowEnd`. For a sub-day window (hours) there is no "yesterday",
  // so the requested window itself becomes the reference set.
  private selectReferenceLogs(
    normalized: NormalizedBatteryLog[],
    shortWindow: boolean,
    referenceDay: string,
  ): NormalizedBatteryLog[] {
    if (shortWindow) {
      return normalized;
    }

    const yesterday = this.shiftDayKey(referenceDay, -1);
    return normalized.filter((log) => log.day === yesterday);
  }

  analyzeSolar(
    raw: BatteryRawRow[],
    shortWindow: boolean,
    referenceDay: string,
  ): SolarAnalysisResult | null {
    const normalized = this.normalizeLogs(raw);

    if (!normalized.length) {
      return null;
    }

    const referenceLogs = this.selectReferenceLogs(
      normalized,
      shortWindow,
      referenceDay,
    );

    if (!referenceLogs.length) {
      return null;
    }

    const minBat = this.round(this.min(referenceLogs.map((log) => log.bat)), 2);
    const batteryAssessment = shortWindow
      ? this.getShortWindowBatteryAssessment(minBat)
      : this.getPeriodBatteryAssessment(normalized, minBat);
    const statusBateria = batteryAssessment.status;
    const motivoBateria = batteryAssessment.reason;

    const nightLogs = referenceLogs.filter(
      (log) => log.hour >= 18 || log.hour <= 8,
    );
    const baixaPercent = nightLogs.length
      ? this.round(
          (nightLogs.filter((log) => log.bat < 12.1).length /
            nightLogs.length) *
            100,
          2,
        )
      : 0;

    const days = this.unique(normalized.map((log) => log.day));
    const diasOk = days.filter((day) => {
      const dayLogs = normalized.filter((log) => log.day === day);
      const maxUntil12 = this.maxOrNull(
        dayLogs.filter((log) => log.hour <= 12).map((log) => log.bat),
      );
      const maxUntil15 = this.maxOrNull(
        dayLogs.filter((log) => log.hour <= 15).map((log) => log.bat),
      );

      return (
        maxUntil12 !== null &&
        maxUntil15 !== null &&
        maxUntil12 >= 13 &&
        maxUntil15 >= 14
      );
    }).length;

    const eficiencia = days.length
      ? this.round((diasOk / days.length) * 100, 2)
      : 0;
    const ciclos = normalized.reduce((total, log, index) => {
      if (index === 0) {
        return total;
      }

      return normalized[index - 1].bat < 12 && log.bat >= 12
        ? total + 1
        : total;
    }, 0);

    const recentLimit = this.shiftDayKey(referenceDay, -7);
    const recentLogs = normalized.filter((log) => log.day >= recentLimit);
    const recentDays = this.unique(recentLogs.map((log) => log.day));

    let falhasTotal = 0;
    let diasValidos = 0;
    const motivos = { falha13: 0, falha14: 0 };

    for (const day of recentDays) {
      const dayLogs = recentLogs.filter((log) => log.day === day);

      if (dayLogs.length < 10) {
        continue;
      }

      const maxUntil12 = this.maxOrNull(
        dayLogs.filter((log) => log.hour <= 12).map((log) => log.bat),
      );
      const maxUntil15 = this.maxOrNull(
        dayLogs.filter((log) => log.hour <= 15).map((log) => log.bat),
      );

      if (maxUntil12 === null || maxUntil15 === null) {
        continue;
      }

      diasValidos += 1;

      if (maxUntil12 < 13) {
        motivos.falha13 += 1;
        falhasTotal += 1;
      }

      if (maxUntil15 < 14) {
        motivos.falha14 += 1;
        falhasTotal += 1;
      }
    }

    const { statusCarga, motivoCarga } = shortWindow
      ? {
          statusCarga: 'OK' as const,
          motivoCarga: 'Janela curta: avaliacao de carga diaria nao aplicada',
        }
      : this.getChargeStatus(diasValidos, falhasTotal, motivos);

    const result: SolarAnalysisResult = {
      minBat,
      baixaPercent,
      eficiencia,
      ciclos,
      statusBateria,
      motivoBateria,
      statusCarga,
      motivoCarga,
      performance: 0,
    };

    result.performance = this.calculateSolarPerformance(result);
    return result;
  }

  analyzeFonte(
    raw: BatteryRawRow[],
    shortWindow: boolean,
    referenceDay: string,
  ): FonteAnalysisResult | null {
    const normalized = this.normalizeLogs(raw);

    if (!normalized.length) {
      return null;
    }

    const referenceLogs = this.selectReferenceLogs(
      normalized,
      shortWindow,
      referenceDay,
    );

    if (!referenceLogs.length) {
      return null;
    }

    const minBat = this.round(this.min(referenceLogs.map((log) => log.bat)), 2);
    const batteryAssessment = shortWindow
      ? this.getShortWindowBatteryAssessment(minBat)
      : this.getPeriodBatteryAssessment(normalized, minBat);
    const status = batteryAssessment.status;
    const motivo = batteryAssessment.reason;
    const quedasBruscas = normalized.reduce((total, log, index) => {
      if (index === 0) {
        return total;
      }

      return normalized[index - 1].bat > 14 && log.bat < 12.1
        ? total + 1
        : total;
    }, 0);

    const result: FonteAnalysisResult = {
      minBat,
      quedasBruscas,
      tempoDescarga: 0,
      status,
      motivo,
      performance: 0,
    };

    result.performance = this.calculateFontePerformance(result);
    return result;
  }

  private calculateSolarPerformance(result: SolarAnalysisResult): number {
    let sBat = 40;

    if (result.statusBateria === 'OK') {
      sBat = 100;
    } else if (result.statusBateria === 'ATENCAO') {
      sBat = 70;
    }

    let sCarga = 40;

    if (result.statusCarga === 'OK') {
      sCarga = 100;
    } else if (result.statusCarga === 'ATENCAO') {
      sCarga = 70;
    }

    const sBaixa = Math.max(0, 100 - result.baixaPercent);
    return this.round(
      sBat * 0.4 + sCarga * 0.3 + result.eficiencia * 0.2 + sBaixa * 0.1,
      1,
    );
  }

  private calculateFontePerformance(result: FonteAnalysisResult): number {
    let sBat = 40;

    if (result.status === 'OK') {
      sBat = 100;
    } else if (result.status === 'ATENCAO') {
      sBat = 70;
    }

    const sQuedas = Math.max(0, 100 - result.quedasBruscas * 20);
    const sDescarga = Math.min(100, result.tempoDescarga * 10);

    return this.round(sBat * 0.6 + sQuedas * 0.2 + sDescarga * 0.2, 1);
  }

  private normalizeLogs(raw: BatteryRawRow[]): NormalizedBatteryLog[] {
    return raw
      .filter((row) => row.bat !== null && row.bat > 10 && row.bat < 15)
      .map((row) => {
        const time = new Date(row.time);
        const { day, hour } = this.toDayAndHour(time);
        return {
          time,
          bat: Number(row.bat),
          hour,
          day,
        };
      })
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  }

  // Per-log state-of-charge score from resting voltage bands. Averaging these
  // across sampled logs makes the daily score reflect how the battery actually
  // spent the day instead of being driven by a single penalty trigger.
  private scoreSocVoltage(value: number): number {
    if (value >= 12.7) return 100;
    if (value >= 12.4) return 85;
    if (value >= 12.2) return 70;
    if (value >= 12.0) return 50;
    if (value >= 11.8) return 25;
    return 0;
  }

  private average(values: number[]): number {
    return values.reduce((total, value) => total + value, 0) / values.length;
  }

  private getBatteryStatus(minBat: number): BatteryStatus {
    if (minBat < 11.5) {
      return 'CRITICO';
    }

    if (minBat <= 11.8) {
      return 'ATENCAO';
    }

    return 'OK';
  }

  private getPeriodBatteryAssessment(
    logs: NormalizedBatteryLog[],
    fallbackMinBat: number,
  ): PeriodBatteryAssessment {
    const maxByDay = new Map<string, number>();

    for (const log of logs) {
      const currentMax = maxByDay.get(log.day);
      if (currentMax === undefined || log.bat > currentMax) {
        maxByDay.set(log.day, log.bat);
      }
    }

    const dailyMaximums = Array.from(maxByDay.values());
    const criticalDays = dailyMaximums.filter(
      (maximum) => maximum <= CRITICAL_MAX_VOLTAGE,
    ).length;
    const attentionDays = dailyMaximums.filter(
      (maximum) => maximum < ATTENTION_MAX_VOLTAGE,
    ).length;

    if (criticalDays >= MIN_FAILURE_DAYS) {
      return {
        status: 'CRITICO',
        reason: `Nao ficou acima de ${CRITICAL_MAX_VOLTAGE}V em ${criticalDays} dias`,
      };
    }

    if (dailyMaximums.length > 0 && attentionDays === dailyMaximums.length) {
      return {
        status: 'ATENCAO',
        reason: `Nao atingiu ${ATTENTION_MAX_VOLTAGE}V no periodo selecionado (${attentionDays} dias)`,
      };
    }

    return {
      status: this.getBatteryStatus(fallbackMinBat),
      reason: `Tensao minima: ${fallbackMinBat}V`,
    };
  }

  private getShortWindowBatteryAssessment(
    minBat: number,
  ): PeriodBatteryAssessment {
    if (minBat < SHORT_WINDOW_CRITICAL_VOLTAGE) {
      return {
        status: 'CRITICO',
        reason: `Tensao critica imediata: ${minBat}V (< ${SHORT_WINDOW_CRITICAL_VOLTAGE}V)`,
      };
    }

    return {
      status: 'OK',
      reason: `Janela curta: tensao minima ${minBat}V registrada sem aplicar regra de 7 dias`,
    };
  }

  private getChargeStatus(
    diasValidos: number,
    falhasTotal: number,
    motivos: { falha13: number; falha14: number },
  ): { statusCarga: ChargeStatus; motivoCarga: string } {
    if (diasValidos === 0) {
      return {
        statusCarga: 'SEM_DADOS',
        motivoCarga: 'Sem dados suficientes',
      };
    }

    if (falhasTotal === 0) {
      return {
        statusCarga: 'OK',
        motivoCarga: 'Carregamento normal',
      };
    }

    const partes: string[] = [];

    if (motivos.falha13 > 0) {
      partes.push(`Nao atingiu 13V (${motivos.falha13} dias)`);
    }

    if (motivos.falha14 > 0) {
      partes.push(`Nao atingiu 14V (${motivos.falha14} dias)`);
    }

    return {
      statusCarga: falhasTotal <= diasValidos ? 'ATENCAO' : 'CRITICO',
      motivoCarga: partes.join(' | '),
    };
  }

  private computeDailyHealth(
    day: string,
    dayLogs: NormalizedBatteryLog[],
    byDay: Map<string, NormalizedBatteryLog[]>,
  ): BatteryDailyHealth {
    const values = dayLogs.map((log) => log.bat);
    const sampleCount = values.length;
    const minBat = this.round(Math.min(...values), 2);
    const maxBat = this.round(Math.max(...values), 2);
    const avgBat = this.round(
      values.reduce((total, value) => total + value, 0) / sampleCount,
      2,
    );
    const charged = maxBat >= CHARGE_VOLTAGE;
    const lowVoltageSamples = values.filter(
      (value) => value < LOW_VOLTAGE,
    ).length;
    const criticalVoltageSamples = values.filter(
      (value) => value < CRITICAL_VOLTAGE,
    ).length;
    const lowVoltagePercent = this.round(
      (lowVoltageSamples / sampleCount) * 100,
      2,
    );
    const overnightDrop = this.computeOvernightDrop(day, dayLogs, byDay);

    // The daily score is the average SOC of every sampled log for the day, so a
    // single bad reading shifts it proportionally instead of triggering a fixed
    // penalty. The separate diagnosis signals below still flag patterns.
    const socScores = values.map((value) => this.scoreSocVoltage(value));
    const socScore = this.round(this.average(socScores), 1);
    const deepDischargeSamples = values.filter((value) => value < 11.8).length;
    const riskVoltageSamples = values.filter(
      (value) => value >= 11.8 && value < 12.0,
    ).length;
    const attentionVoltageSamples = values.filter(
      (value) => value >= 12.0 && value < 12.2,
    ).length;

    const dayScore = socScore;
    const diagnosis = this.diagnoseDay(
      charged,
      minBat,
      maxBat,
      lowVoltagePercent,
    );

    return {
      day,
      sampleCount,
      minBat,
      maxBat,
      avgBat,
      charged,
      lowVoltageSamples,
      criticalVoltageSamples,
      lowVoltagePercent,
      overnightDrop,
      socScore,
      deepDischargeSamples,
      riskVoltageSamples,
      attentionVoltageSamples,
      dayScore,
      diagnosis,
    };
  }

  // Evening/afternoon peak of the day minus the following dawn minimum, when
  // both exist. Captures "charged well, then lost voltage overnight".
  private computeOvernightDrop(
    day: string,
    dayLogs: NormalizedBatteryLog[],
    byDay: Map<string, NormalizedBatteryLog[]>,
  ): number | null {
    const eveningPeak = this.maxOrNull(
      dayLogs.filter((log) => log.hour >= 12).map((log) => log.bat),
    );
    if (eveningPeak === null) {
      return null;
    }

    const nextLogs = byDay.get(this.nextDayKey(day));
    if (!nextLogs) {
      return null;
    }

    const dawn = nextLogs.filter((log) => log.hour <= 8).map((log) => log.bat);
    if (!dawn.length) {
      return null;
    }

    return this.round(eveningPeak - Math.min(...dawn), 2);
  }

  private diagnoseDay(
    charged: boolean,
    minBat: number,
    maxBat: number,
    lowVoltagePercent: number,
  ): BatteryDiagnosis {
    if (maxBat < CHARGE_INCOMPLETE_VOLTAGE) {
      return 'FALHA_CARGA';
    }

    // Charged to the trigger but still collapsed below 12.1V => can't hold.
    if (charged && minBat < LOW_VOLTAGE) {
      return 'BATERIA_FRACA';
    }

    if (maxBat < CHARGE_VOLTAGE) {
      return 'FALHA_CARGA';
    }

    if (lowVoltagePercent >= 50) {
      return 'DESCARGA_EXCESSIVA';
    }

    return 'NORMAL';
  }

  // Recent days weigh more so a trend reflects current behavior.
  private aggregateHealthScore(daily: BatteryDailyHealth[]): number {
    const recent = new Set(daily.slice(-3).map((day) => day.day));
    let weightSum = 0;
    let scoreSum = 0;

    for (const day of daily) {
      const weight = recent.has(day.day) ? 1.3 : 1.0;
      weightSum += weight;
      scoreSum += day.dayScore * weight;
    }

    return this.round(scoreSum / weightSum, 1);
  }

  private classifyLifeStatus(healthScore: number): BatteryLifeStatus {
    if (healthScore >= 85) {
      return 'OK';
    }
    if (healthScore >= 70) {
      return 'ATENCAO';
    }
    if (healthScore >= 50) {
      return 'ATENCAO';
    }
    return 'CRITICO';
  }

  private classifyConfidence(
    shortWindow: boolean,
    validDays: number,
    options: HealthAnalysisOptions = {},
  ): BatteryConfidence {
    if (shortWindow) {
      return 'BAIXA';
    }
    if (options.periodHours !== undefined && options.periodHours >= 24) {
      return validDays >= 1 ? 'MEDIA' : 'BAIXA';
    }
    if (options.periodDays !== undefined && options.periodDays >= 7) {
      return validDays >= 7 ? 'ALTA' : validDays >= 3 ? 'MEDIA' : 'BAIXA';
    }
    if (options.periodDays !== undefined && options.periodDays >= 3) {
      return validDays >= 3 ? 'MEDIA' : 'BAIXA';
    }
    if (validDays < RECURRENCE_DAYS) {
      return 'BAIXA';
    }
    if (validDays <= 6) {
      return 'MEDIA';
    }
    return 'ALTA';
  }

  private diagnosePeriod(
    daily: BatteryDailyHealth[],
    shortWindow: boolean,
    confidence: BatteryConfidence,
  ): { diagnosis: BatteryDiagnosis; reasons: string[] } {
    const lowVoltagePresent = daily.some((day) => day.lowVoltageSamples > 0);
    const chargedDays = daily.filter((day) => day.charged).length;
    const chargeFailDays = daily.filter(
      (day) => day.maxBat < CHARGE_VOLTAGE,
    ).length;
    const strongChargeFailDays = daily.filter(
      (day) => day.maxBat < CHARGE_INCOMPLETE_VOLTAGE,
    ).length;
    // A charged battery that still drops below 12.1V is the weak signal; a
    // strong overnight drop reinforces it but does not define it on its own.
    const lowAfterChargeDays = daily.filter(
      (day) => day.charged && day.minBat < LOW_VOLTAGE,
    ).length;
    const strongOvernightDays = daily.filter(
      (day) =>
        day.charged &&
        day.minBat < LOW_VOLTAGE &&
        day.overnightDrop !== null &&
        day.overnightDrop >= STRONG_OVERNIGHT_DROP,
    ).length;
    const batteryWeakDays = lowAfterChargeDays;
    const excessiveDays = daily.filter(
      (day) => day.lowVoltagePercent >= 50,
    ).length;

    if (shortWindow || confidence === 'BAIXA') {
      // Short windows (and any low-sample period) only describe recent state;
      // they must not promise a life-util trend.
      if (lowVoltagePresent) {
        return {
          diagnosis: 'BAIXA_TENSAO_RECENTE',
          reasons: [
            'Janela curta: tensao baixa detectada no periodo recente. Vida util inconclusiva.',
          ],
        };
      }
      return {
        diagnosis: 'NORMAL',
        reasons: ['Estado recente sem tensao baixa relevante.'],
      };
    }

    if (daily.length < RECURRENCE_DAYS) {
      if (chargeFailDays >= 1 || strongChargeFailDays >= 1) {
        const reasons = [
          `Nao atingiu 14.0V em ${chargeFailDays} dia(s) valido(s); verificar placa solar, fonte, controlador ou conexoes.`,
        ];
        if (strongChargeFailDays > 0) {
          reasons.push(`Nao atingiu 13.5V em ${strongChargeFailDays} dia(s)`);
        }
        return { diagnosis: 'FALHA_CARGA', reasons };
      }
      if (batteryWeakDays >= 1 && chargedDays >= 1) {
        return {
          diagnosis: 'BATERIA_FRACA',
          reasons: [
            `Bateria carregou, mas perdeu tensao rapidamente em ${batteryWeakDays} dia(s) valido(s).`,
          ],
        };
      }
      if (excessiveDays >= 1) {
        return {
          diagnosis: 'DESCARGA_EXCESSIVA',
          reasons: [
            'Tempo elevado em baixa tensao no periodo; verificar consumo, curto, carga e bateria.',
          ],
        };
      }
      return {
        diagnosis: 'NORMAL',
        reasons: ['Comportamento dentro do esperado no periodo.'],
      };
    }

    // Battery charges but discharges too fast.
    if (batteryWeakDays >= RECURRENCE_DAYS && chargedDays >= RECURRENCE_DAYS) {
      const reasons: string[] = [];
      if (strongOvernightDays > 0) {
        reasons.push(`Queda noturna forte em ${strongOvernightDays} dias`);
      }
      if (lowAfterChargeDays > 0) {
        reasons.push('Baixa tensao recorrente abaixo de 12.1V');
      }
      reasons.push(
        `Bateria carrega, mas perde tensao rapidamente durante a noite em ${batteryWeakDays} dias validos.`,
      );
      return { diagnosis: 'BATERIA_FRACA', reasons };
    }

    // Cannot reach the charge voltage.
    if (chargeFailDays >= RECURRENCE_DAYS || strongChargeFailDays >= 2) {
      const reasons = [
        `Nao atingiu 14.0V em ${chargeFailDays} dias validos; verificar placa solar, fonte, controlador ou conexoes.`,
      ];
      if (strongChargeFailDays > 0) {
        reasons.push(`Nao atingiu 13.5V em ${strongChargeFailDays} dias`);
      }
      return { diagnosis: 'FALHA_CARGA', reasons };
    }

    // Recurrent low level without a conclusive charge/battery separation.
    if (excessiveDays >= 1) {
      return {
        diagnosis: 'DESCARGA_EXCESSIVA',
        reasons: [
          'Tempo elevado em baixa tensao no periodo; verificar consumo, curto, carga e bateria.',
        ],
      };
    }

    return {
      diagnosis: 'NORMAL',
      reasons: ['Comportamento dentro do esperado no periodo.'],
    };
  }

  private toDayAndHour(date: Date): { day: string; hour: number } {
    const parts = this.partsFormatter.formatToParts(date);
    let year = '';
    let month = '';
    let day = '';
    let hour = '0';
    for (const part of parts) {
      if (part.type === 'year') year = part.value;
      else if (part.type === 'month') month = part.value;
      else if (part.type === 'day') day = part.value;
      else if (part.type === 'hour') hour = part.value;
    }
    // Some ICU builds emit "24" for midnight with hour12:false; normalize.
    return { day: `${year}-${month}-${day}`, hour: Number(hour) % 24 };
  }

  private toDayKey(date: Date): string {
    return this.toDayAndHour(date).day;
  }

  private nextDayKey(day: string): string {
    return this.shiftDayKey(day, 1);
  }

  private shiftDayKey(day: string, deltaDays: number): string {
    const [year, month, dayOfMonth] = day.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, dayOfMonth));
    date.setUTCDate(date.getUTCDate() + deltaDays);
    const shiftedYear = date.getUTCFullYear();
    const shiftedMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
    const shiftedDay = String(date.getUTCDate()).padStart(2, '0');
    return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
  }

  private unique(values: string[]): string[] {
    return Array.from(new Set(values));
  }

  private min(values: number[]): number {
    return Math.min(...values);
  }

  private maxOrNull(values: number[]): number | null {
    return values.length ? Math.max(...values) : null;
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}
