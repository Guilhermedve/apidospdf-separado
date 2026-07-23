import { renderDetailedReportHtml } from '../../../src/pdf/report-detailed.html';
import type {
  DetailedDeviceData,
  DetailedReportData,
} from '../../../src/template/report-data.types';

function device(
  overrides: Partial<DetailedDeviceData> = {},
): DetailedDeviceData {
  return {
    addr: '045',
    classification: 'SENSORIAMENTO',
    functionLabel: 'Sensor analógico',
    model: 'MOD-1',
    powerType: 'SOLAR',
    status: 'ATENCAO',
    diagnosis: 'FALHA_CARGA',
    confidence: 'MEDIA',
    reason: 'Não atingiu a tensão esperada.',
    sampleCount: 12,
    minimumVoltage: 12.8,
    maximumVoltage: 13.9,
    averageVoltage: 13.2,
    dailyTelemetry: [
      {
        day: '2026-07-08',
        dayLabel: '08/07',
        sampleCount: 6,
        minimumVoltage: 12.8,
        maximumVoltage: 13.5,
        averageVoltage: 13.1,
        diagnosis: 'FALHA_CARGA',
        healthScore: 55,
      },
      {
        day: '2026-07-09',
        dayLabel: '09/07',
        sampleCount: 6,
        minimumVoltage: 13.0,
        maximumVoltage: 13.9,
        averageVoltage: 13.4,
        diagnosis: 'NORMAL',
        healthScore: 80,
      },
    ],
    ...overrides,
  };
}

function baseData(
  overrides: Partial<DetailedReportData> = {},
): DetailedReportData {
  return {
    header: {
      title: 'Relatório técnico de baterias',
      unitName: 'fazenda exemplo',
      period: '3d',
      periodLabel: 'Últimos 3 dias',
      windowStartLabel: '07/07/2026 10:00',
      windowEndLabel: '10/07/2026 10:00',
      generatedAt: '2026-07-10T13:00:00.000Z',
      generatedAtLabel: '10/07/2026 10:00',
      reportId: 'fazenda-3d-20260710',
    },
    summary: {
      overallStatus: 'ATENCAO',
      totalDevices: 2,
      healthyDevices: 0,
      attentionDevices: 2,
      criticalDevices: 0,
      noDataDevices: 0,
      totalAlerts: 2,
      overallHealth: 50,
    },
    kpis: { totalSamples: 24, automationDevices: 1, sensingDevices: 1 },
    conclusion: {
      title: 'Atenção recomendada',
      body: 'Há dispositivos em atenção.',
      recommendations: ['Agendar verificação preventiva.'],
    },
    automationDevices: [device({ addr: '010', classification: 'AUTOMACAO' })],
    sensingDevices: [device({ addr: '045' })],
    technicalEvents: [
      {
        deviceAddr: '045',
        kind: 'DEVICE_ERROR',
        occurredAt: null,
        occurredAtLabel: 'Período',
        severity: 'CRITICO',
        message: 'Falha de comunicação',
        count: 1,
      },
      {
        deviceAddr: '045',
        kind: 'NOTE',
        occurredAt: '2026-07-08T08:00:00.000Z',
        occurredAtLabel: '08/07/2026 05:00',
        severity: 'INFO',
        message: 'Reinício manual',
        count: 2,
      },
    ],
    ...overrides,
  };
}

describe('renderDetailedReportHtml', () => {
  it('renderiza todas as seções técnicas', () => {
    const html = renderDetailedReportHtml(baseData());

    expect(html).toContain('Resumo executivo');
    expect(html).toContain('Parecer geral');
    expect(html).toContain('Mapa de calor');
    expect(html).toContain('Automação');
    expect(html).toContain('Sensoriamento');
    expect(html).toContain('Telemetria diária');
    expect(html).toContain('Eventos técnicos');
    expect(html).toContain('Mínima');
    expect(html).toContain('Máxima');
    expect(html).toContain('Média');
    expect(html).toContain('Amostras');
    expect(html).toContain('DIR 045');
    expect(html).toMatch(/<svg[^>]*class="sparkline"/);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });

  it('mostra estados vazios sem quebrar o HTML', () => {
    const html = renderDetailedReportHtml(
      baseData({
        automationDevices: [],
        sensingDevices: [
          device({ addr: '045', dailyTelemetry: [] }),
        ],
        technicalEvents: [],
      }),
    );

    expect(html).toContain('Nenhum dispositivo de automação no período.');
    expect(html).toContain('Sem telemetria diária disponível.');
    expect(html).toContain('Nenhum evento técnico registrado.');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('usa texto de indisponibilidade quando há menos de dois pontos', () => {
    const html = renderDetailedReportHtml(
      baseData({
        automationDevices: [],
        sensingDevices: [
          device({
            addr: '045',
            dailyTelemetry: [
              {
                day: '2026-07-08',
                dayLabel: '08/07',
                sampleCount: 6,
                minimumVoltage: 12.8,
                maximumVoltage: 13.5,
                averageVoltage: 13.1,
                diagnosis: 'NORMAL',
                healthScore: 55,
              },
            ],
          }),
        ],
        technicalEvents: [],
      }),
    );

    expect(html).toContain('Tendência indisponível');
    expect(html).not.toMatch(/<svg[^>]*class="sparkline"/);
  });
});
