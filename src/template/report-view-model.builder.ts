import { Injectable } from '@nestjs/common';
import type {
  BatteryReportData,
  BatteryReportDevice,
} from '../battery/battery-report.types';
import type { ReportPeriod } from '../datapool/datapool.types';
import type {
  DashboardStatus,
  DeviceCardViewModel,
  ReportViewModel,
} from './report-view-model.types';

const periodLabels: Record<ReportPeriod, string> = {
  '3h': 'Últimas 3 horas',
  '3d': 'Últimos 3 dias',
  '7d': 'Últimos 7 dias',
};

const statusScores: Record<DashboardStatus, number> = {
  OK: 100,
  ATENCAO: 50,
  CRITICO: 0,
  SEM_DADOS: 0,
};

const statusOrder: Record<DashboardStatus, number> = {
  CRITICO: 0,
  ATENCAO: 1,
  OK: 2,
  SEM_DADOS: 3,
};

@Injectable()
export class ReportViewModelBuilder {
  build(data: BatteryReportData): ReportViewModel {
    const devices = data.devices.map((device) => this.mapDevice(device));
    const analyzableDevices = devices.filter(
      (device) => device.hasDataInPeriod,
    );
    const automationDevices = this.sortDevices(
      devices.filter((device) => device.classification === 'AUTOMACAO'),
    );
    const sensingDevices = this.sortDevices(
      devices.filter((device) => device.classification === 'SENSORIAMENTO'),
    );

    return {
      title: 'Relatório de saúde das baterias',
      farm: data.farm,
      period: data.period,
      periodLabel: periodLabels[data.period],
      generatedAt: data.generatedAt,
      generatedAtLabel: this.formatGeneratedAt(data.generatedAt),
      summary: {
        totalDevices: devices.length,
        healthyDevices: analyzableDevices.filter(
          (device) => device.status === 'OK',
        ).length,
        attentionDevices: analyzableDevices.filter(
          (device) => device.status === 'ATENCAO',
        ).length,
        criticalDevices: analyzableDevices.filter(
          (device) => device.status === 'CRITICO',
        ).length,
        noDataDevices: devices.length - analyzableDevices.length,
        overallHealth: this.calculateOverallHealth(analyzableDevices),
        automationDevices: automationDevices.length,
        sensingDevices: sensingDevices.length,
      },
      automationDevices,
      sensingDevices,
    };
  }

  private mapDevice(device: BatteryReportDevice): DeviceCardViewModel {
    const hasDataInPeriod = device.hasDataInPeriod;
    const status = hasDataInPeriod ? this.status(device) : 'SEM_DADOS';
    return {
      addr: device.addr,
      hasDataInPeriod,
      samplesInPeriod: device.samplesInPeriod,
      classification:
        device.classification === 'SENSORIAMENTO'
          ? 'SENSORIAMENTO'
          : 'AUTOMACAO',
      primaryFunctionLabel: device.primaryFunctionLabel,
      powerType: device.modelType === 'FONTE' ? 'FONTE' : 'SOLAR',
      performance: hasDataInPeriod
        ? this.round(device.health.healthScore, 1)
        : 0,
      minimumVoltage: hasDataInPeriod
        ? this.round(device.stats.minBat ?? device.legacy?.minBat ?? 0, 2)
        : 0,
      status,
      diagnosis: hasDataInPeriod
        ? this.diagnosis(device, status)
        : 'DADOS_INSUFICIENTES',
      confidence: hasDataInPeriod ? device.health.confidence : 'BAIXA',
      reason: hasDataInPeriod
        ? this.reason(device)
        : 'FALTA DE DADOS NO PERÍODO SELECIONADO',
      daily: hasDataInPeriod
        ? device.health.daily.slice(-14).map((day) => ({
            day: day.day,
            dayScore: day.dayScore,
            diagnosis: day.diagnosis,
          }))
        : [],
    };
  }

  private status(device: BatteryReportDevice): DashboardStatus {
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
    status: DashboardStatus,
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

    return [
      device.legacy?.motivoBateria,
      device.legacy?.motivoCarga,
    ]
      .filter((reason): reason is string => Boolean(reason))
      .join(' | ');
  }

  private calculateOverallHealth(devices: DeviceCardViewModel[]): number {
    if (!devices.length) {
      return 0;
    }
    const total = devices.reduce(
      (sum, device) => sum + statusScores[device.status],
      0,
    );
    return this.round(total / devices.length, 1);
  }

  private sortDevices(devices: DeviceCardViewModel[]): DeviceCardViewModel[] {
    return [...devices].sort(
      (left, right) =>
        statusOrder[left.status] - statusOrder[right.status] ||
        left.performance - right.performance,
    );
  }

  private formatGeneratedAt(iso: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Fortaleza',
    }).format(new Date(iso));
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}
