import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BatteryAnalysisService } from '../../../src/battery/battery-analysis.service';
import { BatteryReportMapper } from '../../../src/battery/battery-report.mapper';
import { DeviceSelectionService } from '../../../src/battery/device-selection.service';
import { parseDatapoolPeriodDocument } from '../../../src/datapool/datapool.schema';
import { ReportDataBuilder } from '../../../src/template/report-data.builder';
import { ReportDocumentService } from '../../../src/template/report-document.service';
import { ReportHtmlRenderer } from '../../../src/template/report-html.renderer';

const document = parseDatapoolPeriodDocument(
  JSON.parse(
    readFileSync(
      join(process.cwd(), 'test', 'fixtures', 'datapool', 'entre-rios-3d.json'),
      'utf8',
    ),
  ),
);

function createService(): ReportDocumentService {
  return new ReportDocumentService(
    new DeviceSelectionService(),
    new BatteryReportMapper(new BatteryAnalysisService()),
    new ReportDataBuilder(),
    new ReportHtmlRenderer(),
  );
}

describe('ReportDocumentService', () => {
  it('renderiza a variante executiva sem seções técnicas', () => {
    const html = createService().render(document, undefined, 'simple');

    expect(html).toContain('Resumo executivo');
    expect(html).toContain('fazenda exemplo');
    expect(html).not.toContain('Telemetria diária');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });

  it('renderiza a variante detalhada apenas com os ADDRs solicitados', () => {
    const html = createService().render(document, ['045', '038'], 'detailed');

    expect(html).toContain('Telemetria diária');
    expect(html).toContain('DIR 045');
    expect(html).toContain('DIR 038');
    expect(html).not.toContain('DIR 042');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });

  it('assume a variante detalhada quando não informada', () => {
    const html = createService().render(document);

    expect(html).toContain('Telemetria diária');
    expect(html).toContain('Eventos técnicos');
    expect(html).toContain('fazenda exemplo');
  });
});
