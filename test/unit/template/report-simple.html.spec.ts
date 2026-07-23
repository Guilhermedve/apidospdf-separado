import type { SimpleReportData } from '../../../src/template/report-data.types';
import { renderSimpleReportHtml } from '../../../src/pdf/report-simple.html';

function baseData(): SimpleReportData {
  return {
    header: {
      title: 'Relatório executivo de baterias',
      unitName: '<script>alert(1)</script>',
      period: '3d',
      periodLabel: 'Últimos 3 dias',
      windowStartLabel: '07/07/2026 10:00',
      windowEndLabel: '10/07/2026 10:00',
      generatedAt: '2026-07-10T13:00:00.000Z',
      generatedAtLabel: '10/07/2026 10:00',
      reportId: 'fazenda-3d-20260710',
    },
    summary: {
      overallStatus: 'OK',
      totalDevices: 42,
      healthyDevices: 42,
      attentionDevices: 0,
      criticalDevices: 0,
      noDataDevices: 0,
      totalAlerts: 0,
      overallHealth: 100,
    },
    kpis: {
      totalSamples: 84,
      automationDevices: 0,
      sensingDevices: 42,
    },
    conclusion: {
      title: 'Frota saudável',
      body: 'Todos os dispositivos analisáveis estão saudáveis no período selecionado.',
      recommendations: ['Manter o monitoramento preventivo periódico.'],
    },
  };
}

describe('renderSimpleReportHtml', () => {
  it('produz um documento executivo seguro e autocontido', () => {
    const html = renderSimpleReportHtml(baseData());

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<style>');
    expect(html).toMatch(/<img src="data:image\//);
    expect(html).toContain('Resumo executivo');
    expect(html).toContain('Parecer geral');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });

  it('não expõe nenhuma seção técnica', () => {
    const html = renderSimpleReportHtml(baseData());

    for (const forbidden of [
      'Mapa de calor',
      'Inventário de dispositivos',
      'Sensoriamento',
      'Telemetria diária',
      'Eventos técnicos',
      'device-data',
    ]) {
      expect(html).not.toContain(forbidden);
    }
  });

  it('mostra os estados vazios de um período sem dados', () => {
    const data = baseData();
    data.summary = {
      overallStatus: 'SEM_DADOS',
      totalDevices: 3,
      healthyDevices: 0,
      attentionDevices: 0,
      criticalDevices: 0,
      noDataDevices: 3,
      totalAlerts: 3,
      overallHealth: null,
    };
    data.conclusion = {
      title: 'Período inconclusivo',
      body: 'Nenhum dispositivo apresentou amostras válidas no período selecionado.',
      recommendations: ['Verificar a disponibilidade de coleta.'],
    };

    const html = renderSimpleReportHtml(data);

    expect(html).toContain('—');
    expect(html).toContain('Sem dados suficientes');
    expect(html).toContain('Período inconclusivo');
  });
});
