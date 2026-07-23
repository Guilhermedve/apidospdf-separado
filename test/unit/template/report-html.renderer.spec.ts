import * as officialReportHtml from '../../../src/pdf/report-html';
import { ReportHtmlRenderer } from '../../../src/template/report-html.renderer';
import type { ReportViewModel } from '../../../src/template/report-view-model.types';

describe('ReportHtmlRenderer', () => {
  const renderer = new ReportHtmlRenderer();

  it('usa diretamente o modelo visual de src/pdf/report-html.ts', () => {
    const spy = jest.spyOn(officialReportHtml, 'renderReportHtml');
    try {
      const html = renderer.render(viewModel());

      expect(spy).toHaveBeenCalledTimes(1);
      expect(html).toBe(spy.mock.results[0]?.value);
    } finally {
      spy.mockRestore();
    }
  });

  it('usa o mesmo modelo visual com mapa unificado na variante simples', () => {
    const html = renderer.renderSimple(viewModel());

    expect(html).toContain('class="hero"');
    expect(html).toContain('data-testid="heatmap-devices"');
    expect(html).not.toContain('data-testid="heatmap-automation"');
    expect(html).not.toContain('data-testid="heatmap-sensors"');
    expect(html).toContain('id="cause-bars"');
    expect(html).toContain('id="rank"');
    expect(html).toContain('id="device-data"');
  });

  it('escapa textos dinâmicos e não usa recursos externos', () => {
    const html = renderer.render(
      viewModel({
        farm: '<script>alert(1)</script>',
        functionLabel: '<img src=x onerror=alert(1)>',
      }),
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('mantém inventários de automação e sensores lado a lado', () => {
    const html = renderer.render(viewModel());

    expect(html).toContain('class="inventory-split"');
    expect(html).toContain('id="inventory-automation"');
    expect(html).toContain('id="inventory-sensors"');
    expect(html).toContain(
      '.inventory-split{display:grid;grid-template-columns:1fr 1fr',
    );
  });

  it('mostra previsão acima do mini-gráfico em cada card', () => {
    const html = renderer.render(viewModel());

    expect(html).toMatch(
      /<span class="forecast-metric"><small>previsão<\/small><div class="spark"/,
    );
    expect(html).toContain('height:80%');
  });

  it('inclui CSS A4 paisagem e regras de quebra sem empilhar painéis', () => {
    const html = renderer.render(viewModel());

    expect(html).toContain('@page{size:A4;');
    expect(html).toContain('.inventory-panel{break-inside:auto');
    expect(html).toContain('.inventory-mini-card{page-break-inside:avoid');
  });

  it('preserva as seções completas do laudo antigo', () => {
    const html = renderer.render(viewModel());

    expect(html).toContain('class="sheet"');
    expect(html).toContain('class="hero"');
    expect(html).toContain('class="heat-split"');
    expect(html).toContain('data-testid="heatmap-automation"');
    expect(html).toContain('data-testid="heatmap-sensors"');
    expect(html).toContain('id="cause-bars"');
    expect(html).toContain('id="rank"');
    expect(html).toContain('id="device-data"');
    expect(html).toContain('Laudo Técnico de Dispositivos');
    expect(html).toMatch(/<img src="data:image\//);
  });

  it('injeta os dispositivos no contrato do template sem permitir fechamento de script', () => {
    const html = renderer.render(
      viewModel({ functionLabel: '</script><script>alert(1)</script>' }),
    );
    const payload = html.match(
      /<script type="application\/json" id="device-data">(.*?)<\/script>/s,
    )?.[1];

    expect(payload).toBeDefined();
    expect(payload).not.toContain('</script>');
    expect(payload).toContain('\\u003c/script\\u003e');
    expect(payload).toContain('primaryFunctionLabel');
  });

  it('mostra falta de dados sem imprimir zero por cento como saude', () => {
    const view = viewModel();
    const missing = view.sensingDevices[0];
    missing.hasDataInPeriod = false;
    missing.samplesInPeriod = 0;
    missing.status = 'SEM_DADOS';
    missing.performance = 0;
    missing.reason = 'FALTA DE DADOS NO PERÍODO SELECIONADO';

    const html = renderer.render(view);

    expect(html).toContain('cell nodata');
    expect(html).toContain('FALTA DE DADOS NO PERÍODO SELECIONADO');
    expect(html).not.toMatch(
      /DIR 045[\s\S]{0,500}>0<span style="font-size:9px">%/,
    );
  });
});

function viewModel(
  overrides: { farm?: string; functionLabel?: string } = {},
): ReportViewModel {
  const device = {
    addr: '045',
    hasDataInPeriod: true,
    samplesInPeriod: 2,
    classification: 'SENSORIAMENTO' as const,
    primaryFunctionLabel: overrides.functionLabel ?? 'Sensor analógico',
    powerType: 'SOLAR' as const,
    performance: 80,
    minimumVoltage: 12.8,
    status: 'ATENCAO' as const,
    diagnosis: 'FALHA_CARGA',
    confidence: 'MEDIA',
    reason: 'Não atingiu a tensão esperada.',
    daily: [
      { day: '2026-07-08', dayScore: 55, diagnosis: 'FALHA_CARGA' },
      { day: '2026-07-09', dayScore: 80, diagnosis: 'NORMAL' },
    ],
  };

  return {
    title: 'Relatório de saúde das baterias',
    farm: overrides.farm ?? 'entre rios',
    period: '3d',
    periodLabel: 'Últimos 3 dias',
    generatedAt: '2026-07-10T15:00:00.000Z',
    generatedAtLabel: '10/07/2026 12:00',
    summary: {
      totalDevices: 2,
      healthyDevices: 0,
      attentionDevices: 2,
      criticalDevices: 0,
      noDataDevices: 0,
      overallHealth: 50,
      automationDevices: 1,
      sensingDevices: 1,
    },
    automationDevices: [
      { ...device, addr: '010', classification: 'AUTOMACAO' },
    ],
    sensingDevices: [device],
  };
}
