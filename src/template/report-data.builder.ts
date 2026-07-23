import { Injectable } from '@nestjs/common';
import type {
  BatteryReportData,
  BatteryReportDevice,
} from '../battery/battery-report.types';
import type { ReportPeriod } from '../datapool/datapool.types';
import type {
  DailyTelemetryData,
  DetailedDeviceData,
  DetailedReportData,
  ReportConclusionData,
  ReportHeaderData,
  ReportKpiData,
  ReportOverallStatus,
  ReportSummaryData,
  SimpleReportData,
  TechnicalEventData,
  TechnicalEventKind,
} from './report-data.types';

const TIME_ZONE = 'America/Fortaleza';
const MISSING_TEXT = 'Não informado';

const periodLabels: Record<ReportPeriod, string> = {
  '3h': 'Últimas 3 horas',
  '3d': 'Últimos 3 dias',
  '7d': 'Últimos 7 dias',
};

const statusScore: Record<ReportOverallStatus, number> = {
  OK: 100,
  ATENCAO: 50,
  CRITICO: 0,
  SEM_DADOS: 0,
};

const statusOrder: Record<ReportOverallStatus, number> = {
  CRITICO: 0,
  ATENCAO: 1,
  OK: 2,
  SEM_DADOS: 3,
};

interface AnalyzedDevice {
  device: BatteryReportDevice;
  status: ReportOverallStatus;
  diagnosis: string;
}

@Injectable()
export class ReportDataBuilder {
  buildSimple(data: BatteryReportData): SimpleReportData {
    const analyzed = data.devices.map((device) => this.analyze(device));
    const summary = this.summarize(analyzed);
    return {
      header: this.header(data, 'Relatório executivo de baterias'),
      summary,
      kpis: this.kpis(analyzed),
      conclusion: this.conclusion(summary),
    };
  }

  buildDetailed(data: BatteryReportData): DetailedReportData {
    const analyzed = data.devices.map((device) => this.analyze(device));
    const summary = this.summarize(analyzed);
    const cards = analyzed.map((entry) => this.deviceCard(entry));
    return {
      header: this.header(data, 'Relatório técnico de baterias'),
      summary,
      kpis: this.kpis(analyzed),
      conclusion: this.conclusion(summary),
      automationDevices: this.sortCards(
        cards.filter((card) => card.classification === 'AUTOMACAO'),
      ),
      sensingDevices: this.sortCards(
        cards.filter((card) => card.classification === 'SENSORIAMENTO'),
      ),
      technicalEvents: this.technicalEvents(analyzed),
    };
  }

  private header(
    data: BatteryReportData,
    title: string,
  ): ReportHeaderData {
    return {
      title,
      unitName: this.text(data.farm),
      period: data.period,
      periodLabel: periodLabels[data.period],
      windowStartLabel: this.formatDateTime(data.windowStart),
      windowEndLabel: this.formatDateTime(data.windowEnd),
      generatedAt: data.generatedAt,
      generatedAtLabel: this.formatDateTime(data.generatedAt),
      reportId: this.reportId(data),
    };
  }

  private summarize(analyzed: AnalyzedDevice[]): ReportSummaryData {
    const analyzable = analyzed.filter(
      (entry) => entry.device.hasDataInPeriod,
    );
    const healthyDevices = analyzable.filter(
      (entry) => entry.status === 'OK',
    ).length;
    const attentionDevices = analyzable.filter(
      (entry) => entry.status === 'ATENCAO',
    ).length;
    const criticalDevices = analyzable.filter(
      (entry) => entry.status === 'CRITICO',
    ).length;
    const noDataDevices = analyzed.length - analyzable.length;

    return {
      overallStatus: this.overallStatus(
        analyzable.length,
        criticalDevices,
        attentionDevices,
        noDataDevices,
      ),
      totalDevices: analyzed.length,
      healthyDevices,
      attentionDevices,
      criticalDevices,
      noDataDevices,
      totalAlerts: attentionDevices + criticalDevices + noDataDevices,
      overallHealth: this.overallHealth(analyzable),
    };
  }

  private overallStatus(
    analyzableCount: number,
    criticalDevices: number,
    attentionDevices: number,
    noDataDevices: number,
  ): ReportOverallStatus {
    if (analyzableCount === 0) return 'SEM_DADOS';
    if (criticalDevices > 0) return 'CRITICO';
    if (attentionDevices > 0 || noDataDevices > 0) return 'ATENCAO';
    return 'OK';
  }

  private overallHealth(analyzable: AnalyzedDevice[]): number | null {
    if (!analyzable.length) {
      return null;
    }
    const total = analyzable.reduce(
      (sum, entry) => sum + statusScore[entry.status],
      0,
    );
    return this.round(total / analyzable.length, 1);
  }

  private kpis(analyzed: AnalyzedDevice[]): ReportKpiData {
    return {
      totalSamples: analyzed.reduce(
        (sum, entry) => sum + entry.device.samplesInPeriod,
        0,
      ),
      automationDevices: analyzed.filter(
        (entry) => this.classification(entry.device) === 'AUTOMACAO',
      ).length,
      sensingDevices: analyzed.filter(
        (entry) => this.classification(entry.device) === 'SENSORIAMENTO',
      ).length,
    };
  }

  private conclusion(summary: ReportSummaryData): ReportConclusionData {
    switch (summary.overallStatus) {
      case 'SEM_DADOS':
        return {
          title: 'Período inconclusivo',
          body: 'Nenhum dispositivo apresentou amostras válidas no período selecionado, portanto não é possível emitir um parecer de saúde.',
          recommendations: [
            'Verificar a disponibilidade de coleta e a conectividade dos dispositivos antes de reemitir o relatório.',
          ],
        };
      case 'CRITICO':
        return {
          title: 'Ação imediata necessária',
          body: `Foram identificados ${summary.criticalDevices} dispositivo(s) em estado crítico e ${summary.totalAlerts} alerta(s) no total.`,
          recommendations: [
            'Priorizar a substituição ou manutenção dos dispositivos críticos.',
            'Revisar os alertas de atenção e ausência de dados em seguida.',
          ],
        };
      case 'ATENCAO':
        return {
          title: 'Atenção recomendada',
          body: `Há ${summary.attentionDevices} dispositivo(s) em atenção e ${summary.noDataDevices} sem dados no período, sem casos críticos.`,
          recommendations: [
            'Agendar verificação preventiva dos dispositivos em atenção.',
            'Confirmar a coleta dos dispositivos sem dados no período.',
          ],
        };
      default:
        return {
          title: 'Frota saudável',
          body: 'Todos os dispositivos analisáveis estão saudáveis no período selecionado.',
          recommendations: [
            'Manter o monitoramento preventivo periódico.',
          ],
        };
    }
  }

  private deviceCard(entry: AnalyzedDevice): DetailedDeviceData {
    const { device, status, diagnosis } = entry;
    const hasData = device.hasDataInPeriod;
    return {
      addr: device.addr,
      classification: this.classification(device),
      functionLabel: this.text(device.primaryFunctionLabel),
      model: this.text(device.model),
      powerType: device.modelType === 'FONTE' ? 'FONTE' : 'SOLAR',
      status,
      diagnosis: this.text(diagnosis),
      confidence: hasData ? this.text(device.health.confidence) : MISSING_TEXT,
      reason: this.text(this.reason(device)),
      sampleCount: device.samplesInPeriod,
      minimumVoltage: hasData ? this.nullable(device.stats.minBat) : null,
      maximumVoltage: hasData ? this.nullable(device.stats.maxBat) : null,
      averageVoltage: hasData ? this.nullable(device.stats.avgBat) : null,
      dailyTelemetry: device.health.daily.map((day) =>
        this.dailyTelemetry(day),
      ),
    };
  }

  private dailyTelemetry(
    day: BatteryReportDevice['health']['daily'][number],
  ): DailyTelemetryData {
    return {
      day: day.day,
      dayLabel: this.formatDate(day.day),
      sampleCount: day.sampleCount,
      minimumVoltage: this.nullable(day.minBat),
      maximumVoltage: this.nullable(day.maxBat),
      averageVoltage: this.nullable(day.avgBat),
      diagnosis: this.text(day.diagnosis),
      healthScore: this.nullable(day.dayScore),
    };
  }

  private technicalEvents(analyzed: AnalyzedDevice[]): TechnicalEventData[] {
    const events = new Map<string, TechnicalEventData>();

    const push = (
      deviceAddr: string,
      kind: TechnicalEventKind,
      occurredAt: string | null,
      severity: TechnicalEventData['severity'],
      message: string,
    ): void => {
      const localDay = occurredAt?.slice(0, 10) ?? 'PERIOD';
      const key = [deviceAddr, kind, localDay, message].join('|');
      const existing = events.get(key);
      if (existing) {
        existing.count += 1;
        return;
      }
      events.set(key, {
        deviceAddr,
        kind,
        occurredAt,
        occurredAtLabel: occurredAt ? this.formatDateTime(occurredAt) : 'Período',
        severity,
        message,
        count: 1,
      });
    };

    for (const { device } of analyzed) {
      const addr = device.addr;

      if (device.errorMessage?.trim() || device.status !== 'ready') {
        push(
          addr,
          'DEVICE_ERROR',
          null,
          'CRITICO',
          device.errorMessage?.trim() || `Status do dispositivo: ${device.status}`,
        );
      }

      for (const flag of device.health.flags) {
        if (flag.trim()) {
          push(addr, 'HEALTH_FLAG', null, 'ATENCAO', flag.trim());
        }
      }

      for (const day of device.health.daily) {
        if (day.diagnosis && day.diagnosis !== 'NORMAL') {
          push(addr, 'DIAGNOSTIC', day.day, 'ATENCAO', day.diagnosis);
        }
      }

      for (const row of device.raw) {
        const note = row.note?.trim();
        if (note) {
          push(addr, 'NOTE', row.time, 'INFO', note);
        }
      }

      const signals = device.health.signals;
      if (signals?.brownout.detected) {
        push(
          addr,
          'BROWNOUT',
          null,
          'CRITICO',
          `Brownout detectado (${signals.brownout.resets} reinício(s)).`,
        );
      }
      if (signals?.chargeTrend.declining) {
        push(
          addr,
          'CHARGE_TREND',
          null,
          'ATENCAO',
          'Tendência de carga em queda no período.',
        );
      }
    }

    return this.sortEvents([...events.values()]);
  }

  private sortEvents(events: TechnicalEventData[]): TechnicalEventData[] {
    return events.sort((left, right) => {
      if (left.occurredAt && right.occurredAt) {
        return right.occurredAt.localeCompare(left.occurredAt);
      }
      if (left.occurredAt) return -1;
      if (right.occurredAt) return 1;
      return 0;
    });
  }

  private analyze(device: BatteryReportDevice): AnalyzedDevice {
    if (!device.hasDataInPeriod) {
      return { device, status: 'SEM_DADOS', diagnosis: 'DADOS_INSUFICIENTES' };
    }
    const status = this.status(device);
    return { device, status, diagnosis: this.diagnosis(device, status) };
  }

  private status(device: BatteryReportDevice): ReportOverallStatus {
    if (
      device.health.confidence === 'BAIXA' &&
      device.health.lifeStatus === 'OK'
    ) {
      return 'ATENCAO';
    }
    if (
      device.health.lifeStatus === 'OK' ||
      device.health.lifeStatus === 'ATENCAO' ||
      device.health.lifeStatus === 'CRITICO'
    ) {
      return device.health.lifeStatus;
    }
    return 'ATENCAO';
  }

  private diagnosis(
    device: BatteryReportDevice,
    status: ReportOverallStatus,
  ): string {
    if (status === 'OK') {
      return 'NORMAL';
    }
    if (
      device.health.confidence === 'BAIXA' &&
      device.health.diagnosis === 'NORMAL'
    ) {
      return 'DADOS_INSUFICIENTES';
    }
    return device.health.diagnosis;
  }

  private reason(device: BatteryReportDevice): string {
    if (device.health.reasons.length) {
      return device.health.reasons.join(' · ');
    }
    return [device.legacy?.motivoBateria, device.legacy?.motivoCarga]
      .filter((reason): reason is string => Boolean(reason?.trim()))
      .join(' | ');
  }

  private classification(
    device: BatteryReportDevice,
  ): 'AUTOMACAO' | 'SENSORIAMENTO' {
    return device.classification === 'SENSORIAMENTO'
      ? 'SENSORIAMENTO'
      : 'AUTOMACAO';
  }

  private sortCards(cards: DetailedDeviceData[]): DetailedDeviceData[] {
    return [...cards].sort(
      (left, right) =>
        statusOrder[left.status] - statusOrder[right.status] ||
        Number(left.addr) - Number(right.addr),
    );
  }

  private reportId(data: BatteryReportData): string {
    const slug = data.farm
      .normalize('NFD')
      .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const stamp = data.generatedAt.replace(/[^0-9]/g, '').slice(0, 14);
    return `${slug || 'relatorio'}-${data.period}-${stamp}`;
  }

  private text(value: string | null | undefined): string {
    const trimmed = value?.trim();
    return trimmed ? trimmed : MISSING_TEXT;
  }

  private nullable(value: number | null | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private formatDateTime(iso: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: TIME_ZONE,
    }).format(new Date(iso));
  }

  private formatDate(value: string): string {
    const parsed = new Date(value.length <= 10 ? `${value}T12:00:00Z` : value);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: TIME_ZONE,
    }).format(parsed);
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}
