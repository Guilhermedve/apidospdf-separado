import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BatteryAnalysisService } from '../../../src/battery/battery-analysis.service';
import { BatteryReportMapper } from '../../../src/battery/battery-report.mapper';
import type { BatteryReportData } from '../../../src/battery/battery-report.types';
import { DeviceSelectionService } from '../../../src/battery/device-selection.service';
import { parseDatapoolPeriodDocument } from '../../../src/datapool/datapool.schema';
import { ReportViewModelBuilder } from '../../../src/template/report-view-model.builder';

const document = parseDatapoolPeriodDocument(
  JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        'test',
        'fixtures',
        'datapool',
        'entre-rios-3d.json',
      ),
      'utf8',
    ),
  ),
);
const reportData = new BatteryReportMapper(new BatteryAnalysisService()).map(
  document,
  new DeviceSelectionService().select(document),
);
const expectedSummary = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      'test',
      'fixtures',
      'template',
      'expected-entre-rios-summary.json',
    ),
    'utf8',
  ),
);

describe('ReportViewModelBuilder', () => {
  const builder = new ReportViewModelBuilder();

  it('produz o resumo homologado para a fixture real', () => {
    const view = builder.build(reportData);

    expect(view.summary).toEqual(expectedSummary);
    expect(view.automationDevices).toHaveLength(0);
    expect(view.sensingDevices).toHaveLength(42);
  });

  it('rebaixa status OK com confiança baixa para atenção', () => {
    const data = singleDeviceReport();
    data.devices[0].health.lifeStatus = 'OK';
    data.devices[0].health.confidence = 'BAIXA';
    data.devices[0].health.diagnosis = 'NORMAL';

    const device = builder.build(data).sensingDevices[0];

    expect(device.status).toBe('ATENCAO');
    expect(device.diagnosis).toBe('DADOS_INSUFICIENTES');
  });

  it('agrupa por classificação e ordena por severidade', () => {
    const data = singleDeviceReport();
    const attention = structuredClone(data.devices[0]);
    attention.addr = '002';
    attention.classification = 'AUTOMACAO';
    attention.health.lifeStatus = 'ATENCAO';
    attention.health.healthScore = 50;
    const critical = structuredClone(attention);
    critical.addr = '003';
    critical.health.lifeStatus = 'CRITICO';
    critical.health.healthScore = 20;
    data.devices = [attention, critical];

    const view = builder.build(data);

    expect(view.automationDevices.map((device) => device.addr)).toEqual([
      '003',
      '002',
    ]);
    expect(view.sensingDevices).toHaveLength(0);
  });

  it('usa motivos de saúde e preserva os dias recentes do gráfico', () => {
    const data = singleDeviceReport();
    data.devices[0].health.reasons = ['Motivo A', 'Motivo B'];

    const device = builder.build(data).sensingDevices[0];

    expect(device.reason).toBe('Motivo A · Motivo B');
    expect(device.daily).toEqual(
      data.devices[0].health.daily.slice(-14).map((day) => ({
        day: day.day,
        dayScore: day.dayScore,
        diagnosis: day.diagnosis,
      })),
    );
  });

  it('marca DIR sem amostras do periodo e o exclui da saude geral', () => {
    const data = singleDeviceReport();
    const withData = structuredClone(data.devices[0]);
    withData.addr = '001';
    withData.hasDataInPeriod = true;
    withData.samplesInPeriod = 3;
    withData.health.lifeStatus = 'OK';
    withData.health.confidence = 'ALTA';
    const withoutData = structuredClone(withData);
    withoutData.addr = '002';
    withoutData.hasDataInPeriod = false;
    withoutData.samplesInPeriod = 0;
    withoutData.health.healthScore = 0;
    data.devices = [withData, withoutData];

    const view = builder.build(data);
    const missing = view.sensingDevices.find((device) => device.addr === '002');

    expect(missing).toMatchObject({
      status: 'SEM_DADOS',
      hasDataInPeriod: false,
      samplesInPeriod: 0,
      reason: 'FALTA DE DADOS NO PERÍODO SELECIONADO',
      performance: 0,
      minimumVoltage: 0,
      diagnosis: 'DADOS_INSUFICIENTES',
      daily: [],
    });
    expect(view.summary).toMatchObject({
      healthyDevices: 1,
      attentionDevices: 0,
      criticalDevices: 0,
      noDataDevices: 1,
      overallHealth: 100,
    });
  });
});

function singleDeviceReport(): BatteryReportData {
  return {
    ...structuredClone(reportData),
    devices: [structuredClone(reportData.devices[0])],
  };
}
