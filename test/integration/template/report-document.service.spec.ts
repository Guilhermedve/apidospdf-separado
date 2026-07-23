import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BatteryAnalysisService } from '../../../src/battery/battery-analysis.service';
import { BatteryReportMapper } from '../../../src/battery/battery-report.mapper';
import { DeviceSelectionService } from '../../../src/battery/device-selection.service';
import { parseDatapoolPeriodDocument } from '../../../src/datapool/datapool.schema';
import { ReportDataBuilder } from '../../../src/template/report-data.builder';
import { ReportDocumentService } from '../../../src/template/report-document.service';
import { ReportHtmlRenderer } from '../../../src/template/report-html.renderer';
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

function createService(): ReportDocumentService {
  return new ReportDocumentService(
    new DeviceSelectionService(),
    new BatteryReportMapper(new BatteryAnalysisService()),
    new ReportViewModelBuilder(),
    new ReportDataBuilder(),
    new ReportHtmlRenderer(),
  );
}

describe('ReportDocumentService', () => {
  it('mantem a variante simples no modelo executivo', () => {
    const html = createService().render(document, undefined, 'simple');

    expect(html).toContain('Resumo executivo');
    expect(html).not.toContain('class="hero"');
    expect(html).not.toContain('id="device-data"');
  });

  it('usa o modelo antigo para a variante detalhada', () => {
    const html = createService().render(document, undefined, 'detailed');

    expect(html).toContain('class="hero"');
    expect(html).toContain('class="heat-split"');
    expect(html).toContain('id="device-data"');
    expect(html).not.toContain('Telemetria diária');
  });

  it('integra os 42 dispositivos recebidos no modelo antigo', () => {
    const html = createService().render(document);
    const devices = extractDevices(html);

    expect(devices).toHaveLength(42);
    expect(devices[0]).toEqual(
      expect.objectContaining({
        addr: expect.stringMatching(/^\d{3}$/),
        primaryFunctionLabel: expect.any(String),
        perf: expect.any(Number),
        minV: expect.any(Number),
        status: expect.stringMatching(/^(OK|ATENCAO|CRITICO)$/),
        daily: expect.any(Array),
      }),
    );
    expect(html).toContain('fazenda exemplo');
    expect(html).toContain('3 dias');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });

  it('preenche o modelo antigo com os campos do contrato sintetico', () => {
    const html = createService().render(document, ['042']);
    const [device] = extractDevices(html);

    expect(html).toContain('fazenda exemplo');
    expect(html).toContain('3 dias');
    expect(html).toContain('DIR 042');
    expect(html).toContain('Sensor analogico');
    expect(html).toContain('12.88 V');
    expect(device).toMatchObject({
      addr: '042',
      classification: 'SENSORIAMENTO',
      primaryFunctionLabel: 'Sensor analogico',
      tipo: 'SOLAR',
      minV: 12.88,
    });
    expect(device.perf).toEqual(expect.any(Number));
    expect(device.status).toMatch(/^(OK|ATENCAO|CRITICO)$/);
    expect(device.diagnosis).toMatch(
      /^(NORMAL|BATERIA_FRACA|FALHA_CARGA|DESCARGA_EXCESSIVA|BAIXA_TENSAO_RECENTE|DADOS_INSUFICIENTES)$/,
    );
    expect(device.confidence).toMatch(/^(BAIXA|MEDIA|ALTA)$/);
  });

  it('inclui somente os ADDRs solicitados', () => {
    const html = createService().render(document, ['045', '038']);
    const devices = extractDevices(html);

    expect(devices.map((device) => device.addr)).toEqual(['045', '038']);
  });

  it('mantem o DIR e mostra aviso quando seus registros estao fora da janela', () => {
    const oldDocument = structuredClone(document);
    const source = oldDocument.devices['042'].raw[0];
    oldDocument.devices['042'].raw = [
      { ...source, time: '2020-01-01T00:00:00.000Z' },
    ];

    const html = createService().render(oldDocument, ['042']);
    const [device] = extractDevices(html);

    expect(device).toMatchObject({
      addr: '042',
      hasDataInPeriod: false,
      samplesInPeriod: 0,
      status: 'SEM_DADOS',
      perf: 0,
    });
    expect(html).toContain('DIR 042');
    expect(html).toContain('FALTA DE DADOS NO PERÍODO SELECIONADO');
    expect(html).toContain('FALTA DE DADOS<br>NO PERÍODO');
  });
});

function extractDevices(html: string): Array<Record<string, unknown>> {
  const payload = html.match(
    /<script type="application\/json" id="device-data">(.*?)<\/script>/s,
  )?.[1];
  if (!payload) throw new Error('device-data payload not found');
  return JSON.parse(payload) as Array<Record<string, unknown>>;
}
