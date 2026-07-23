import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BatteryAnalysisService } from '../../../src/battery/battery-analysis.service';
import { BatteryReportMapper } from '../../../src/battery/battery-report.mapper';
import type { BatteryReportData } from '../../../src/battery/battery-report.types';
import { DeviceSelectionService } from '../../../src/battery/device-selection.service';
import { parseDatapoolPeriodDocument } from '../../../src/datapool/datapool.schema';
import { ReportDataBuilder } from '../../../src/template/report-data.builder';

const document = parseDatapoolPeriodDocument(
  JSON.parse(
    readFileSync(
      join(process.cwd(), 'test', 'fixtures', 'datapool', 'entre-rios-3d.json'),
      'utf8',
    ),
  ),
);
const reportData = new BatteryReportMapper(new BatteryAnalysisService()).map(
  document,
  new DeviceSelectionService().select(document),
);

function singleDeviceReport(): BatteryReportData {
  return {
    ...structuredClone(reportData),
    devices: [structuredClone(reportData.devices[0])],
  };
}

describe('ReportDataBuilder', () => {
  const builder = new ReportDataBuilder();

  it('constrói o resumo executivo homologado', () => {
    expect(builder.buildSimple(reportData)).toMatchObject({
      header: {
        unitName: 'fazenda exemplo',
        period: '3d',
      },
      summary: {
        totalDevices: 42,
        healthyDevices: 42,
        attentionDevices: 0,
        criticalDevices: 0,
        noDataDevices: 0,
        totalAlerts: 0,
        overallStatus: 'OK',
        overallHealth: 100,
      },
      kpis: {
        totalSamples: expect.any(Number),
        automationDevices: 0,
        sensingDevices: 42,
      },
    });
  });

  it('reporta SEM_DADOS quando nenhum dispositivo é analisável', () => {
    const data = singleDeviceReport();
    data.devices[0].hasDataInPeriod = false;
    data.devices[0].samplesInPeriod = 0;

    const summary = builder.buildSimple(data).summary;

    expect(summary.overallStatus).toBe('SEM_DADOS');
    expect(summary.overallHealth).toBeNull();
    expect(summary.noDataDevices).toBe(1);
    expect(summary.totalAlerts).toBe(1);
  });

  it('reporta CRITICO quando existe qualquer dispositivo crítico', () => {
    const data = singleDeviceReport();
    const ok = structuredClone(data.devices[0]);
    ok.addr = '001';
    ok.hasDataInPeriod = true;
    ok.health.lifeStatus = 'OK';
    ok.health.confidence = 'ALTA';
    const critical = structuredClone(ok);
    critical.addr = '002';
    critical.health.lifeStatus = 'CRITICO';
    data.devices = [ok, critical];

    const summary = builder.buildSimple(data).summary;

    expect(summary.overallStatus).toBe('CRITICO');
    expect(summary.criticalDevices).toBe(1);
    expect(summary.totalAlerts).toBe(1);
  });

  it('reporta ATENCAO quando há atenção ou ausência de dados sem crítico', () => {
    const data = singleDeviceReport();
    const ok = structuredClone(data.devices[0]);
    ok.addr = '001';
    ok.hasDataInPeriod = true;
    ok.health.lifeStatus = 'OK';
    ok.health.confidence = 'ALTA';
    const attention = structuredClone(ok);
    attention.addr = '002';
    attention.health.lifeStatus = 'ATENCAO';
    data.devices = [ok, attention];

    expect(builder.buildSimple(data).summary.overallStatus).toBe('ATENCAO');
  });

  it('separa automação e sensoriamento e ordena por severidade e ADDR', () => {
    const data = singleDeviceReport();
    const base = structuredClone(data.devices[0]);
    base.classification = 'AUTOMACAO';
    base.hasDataInPeriod = true;
    base.health.confidence = 'ALTA';
    const ok = structuredClone(base);
    ok.addr = '010';
    ok.health.lifeStatus = 'OK';
    const critical = structuredClone(base);
    critical.addr = '020';
    critical.health.lifeStatus = 'CRITICO';
    const attention = structuredClone(base);
    attention.addr = '005';
    attention.health.lifeStatus = 'ATENCAO';
    data.devices = [ok, critical, attention];

    const detailed = builder.buildDetailed(data);

    expect(detailed.sensingDevices).toHaveLength(0);
    expect(detailed.automationDevices.map((device) => device.addr)).toEqual([
      '020',
      '005',
      '010',
    ]);
  });

  it('mapeia telemetria diária preservando medições ausentes', () => {
    const data = singleDeviceReport();
    const device = data.devices[0];
    device.hasDataInPeriod = true;
    device.stats.minBat = null;
    device.stats.maxBat = null;
    device.stats.avgBat = null;

    const detailed = builder.buildDetailed(data);
    const card = [
      ...detailed.automationDevices,
      ...detailed.sensingDevices,
    ][0];

    expect(card.minimumVoltage).toBeNull();
    expect(card.maximumVoltage).toBeNull();
    expect(card.averageVoltage).toBeNull();
    expect(card.dailyTelemetry).toHaveLength(device.health.daily.length);
  });

  it('usa Não informado para textos em branco', () => {
    const data = singleDeviceReport();
    const device = data.devices[0];
    device.hasDataInPeriod = true;
    device.primaryFunctionLabel = '';
    device.model = '';
    device.health.confidence = '';

    const card = [
      ...builder.buildDetailed(data).automationDevices,
      ...builder.buildDetailed(data).sensingDevices,
    ][0];

    expect(card.functionLabel).toBe('Não informado');
    expect(card.model).toBe('Não informado');
    expect(card.confidence).toBe('Não informado');
  });

  it('não lança com coleções vazias', () => {
    const data = singleDeviceReport();
    data.devices = [];

    const detailed = builder.buildDetailed(data);

    expect(detailed.automationDevices).toEqual([]);
    expect(detailed.sensingDevices).toEqual([]);
    expect(detailed.technicalEvents).toEqual([]);
  });

  it('extrai todos os tipos de evento técnico aprovados', () => {
    const data = singleDeviceReport();
    const device = data.devices[0];
    device.addr = '045';
    device.status = 'error';
    device.errorMessage = 'Falha de comunicação';
    device.health.flags = ['SUSPEITA_SENSOR'];
    device.health.daily[0].diagnosis = 'BATERIA_FRACA';
    device.health.signals = {
      brownout: { resets: 3, detected: true },
      chargeTrend: { slopePerDay: -0.2, days: 3, declining: true },
    };
    device.raw = [
      {
        time: `${device.health.daily[0].day}T08:00:00.000Z`,
        addr: 45,
        version: '1',
        rawBat: 3900,
        bat: 3.9,
        ttl: 1,
        ack: 1,
        retry: 0,
        statRf: 0,
        uptime: 1,
        uuid: 'a',
        note: 'Reinício manual',
      },
      {
        time: `${device.health.daily[0].day}T09:00:00.000Z`,
        addr: 45,
        version: '1',
        rawBat: 3900,
        bat: 3.9,
        ttl: 1,
        ack: 1,
        retry: 0,
        statRf: 0,
        uptime: 1,
        uuid: 'b',
        note: 'Reinício manual',
      },
    ];

    const events = builder.buildDetailed(data).technicalEvents;

    expect(events.map((event) => event.kind)).toEqual(
      expect.arrayContaining([
        'DEVICE_ERROR',
        'DIAGNOSTIC',
        'NOTE',
        'HEALTH_FLAG',
        'BROWNOUT',
        'CHARGE_TREND',
      ]),
    );

    const note = events.find((event) => event.kind === 'NOTE');
    expect(note?.count).toBe(2);
  });
});
