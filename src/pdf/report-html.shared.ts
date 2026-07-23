import { LOGO_DATA_URI } from '../template/report-logo';
import type {
  ReportHeaderData,
  ReportOverallStatus,
  SimpleReportData,
} from '../template/report-data.types';

const STATUS_LABELS: Record<ReportOverallStatus, string> = {
  OK: 'Saudável',
  ATENCAO: 'Atenção',
  CRITICO: 'Crítico',
  SEM_DADOS: 'Sem dados suficientes',
};

const STATUS_CLASS: Record<ReportOverallStatus, string> = {
  OK: 'ok',
  ATENCAO: 'warn',
  CRITICO: 'crit',
  SEM_DADOS: 'muted',
};

export const BASE_REPORT_CSS = `
:root{--ink:#17212b;--muted:#667085;--line:#dfe3e8;--paper:#fff;--soft:#f7f8fa;--gold:#b78a32;--gold-soft:#f8f0df;--ok:#20845a;--ok-soft:#e8f5ef;--warn:#c47a13;--warn-soft:#fff3dd;--crit:#b42318;--crit-soft:#fdecea;--radius:12px}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0;background:var(--paper);color:var(--ink);font-family:Arial,sans-serif;font-size:12px}
.sheet{padding:18px}
.report-header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:3px solid var(--gold);padding-bottom:14px;margin-bottom:16px}
.report-header img{height:46px;width:auto}
.report-header h1{font-size:24px;line-height:1.1;margin:0 0 6px}
.report-header .meta{color:var(--muted);line-height:1.6;text-align:right}
h2{font-size:16px;margin:0 0 10px}
p{margin:0}
.section{margin-bottom:18px;break-inside:avoid;page-break-inside:avoid}
.status-banner{display:flex;align-items:center;gap:14px;border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px;margin-bottom:14px;background:var(--soft)}
.status-badge{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 12px;border-radius:999px}
.status-badge.ok{background:var(--ok-soft);color:var(--ok)}
.status-badge.warn{background:var(--warn-soft);color:var(--warn)}
.status-badge.crit{background:var(--crit-soft);color:var(--crit)}
.status-badge.muted{background:#eef1f4;color:var(--muted)}
.status-headline strong{font-size:22px}
.status-headline small{display:block;color:var(--muted)}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
.kpi-card{border:1px solid var(--line);border-radius:var(--radius);padding:12px;background:var(--soft);break-inside:avoid}
.kpi-card small{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.kpi-card strong{font-size:21px}
.conclusion{border:1px solid var(--line);border-left:4px solid var(--gold);border-radius:var(--radius);padding:14px 16px;background:var(--gold-soft);break-inside:avoid}
.conclusion h3{margin:0 0 6px;font-size:15px}
.conclusion ul{margin:8px 0 0;padding-left:18px;color:var(--muted)}
.report-footer{margin-top:18px;padding-top:10px;border-top:1px solid var(--line);display:flex;justify-content:space-between;color:var(--muted);font-size:10px}
@page{size:A4 landscape;margin:10mm}
@media print{.sheet{padding:0}}
`;

export function escapeHtml(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatMetric(
  value: number | null | undefined,
  suffix = '',
  decimals = 0,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(decimals)}${suffix}`;
}

export function statusLabel(status: ReportOverallStatus): string {
  return STATUS_LABELS[status];
}

export function statusClass(status: ReportOverallStatus): string {
  return STATUS_CLASS[status];
}

export function renderHeader(data: ReportHeaderData): string {
  return `
    <header class="report-header">
      <div>
        <img src="${LOGO_DATA_URI}" alt="3v3">
        <h1>${escapeHtml(data.title)}</h1>
        <p><strong>${escapeHtml(data.unitName)}</strong> · ${escapeHtml(data.periodLabel)}</p>
      </div>
      <div class="meta">
        <p>Janela: ${escapeHtml(data.windowStartLabel)} — ${escapeHtml(data.windowEndLabel)}</p>
        <p>Gerado em ${escapeHtml(data.generatedAtLabel)}</p>
        <p>ID ${escapeHtml(data.reportId)}</p>
      </div>
    </header>`;
}

export function renderExecutiveSummary(data: SimpleReportData): string {
  const { summary, kpis } = data;
  const kpi = (label: string, value: string): string => `
    <div class="kpi-card"><small>${escapeHtml(label)}</small><strong>${value}</strong></div>`;

  return `
    <section class="section">
      <h2>Resumo executivo</h2>
      <div class="status-banner">
        <span class="status-badge ${statusClass(summary.overallStatus)}">${escapeHtml(statusLabel(summary.overallStatus))}</span>
        <div class="status-headline">
          <strong>${formatMetric(summary.overallHealth, '%')}</strong>
          <small>Índice de saúde da frota</small>
        </div>
      </div>
      <div class="kpi-grid">
        ${kpi('Dispositivos', formatMetric(summary.totalDevices))}
        ${kpi('Alertas', formatMetric(summary.totalAlerts))}
        ${kpi('Críticos', formatMetric(summary.criticalDevices))}
        ${kpi('Sem dados', formatMetric(summary.noDataDevices))}
      </div>
      <div class="kpi-grid">
        ${kpi('Amostras no período', formatMetric(kpis.totalSamples))}
        ${kpi('Saudáveis', formatMetric(summary.healthyDevices))}
        ${kpi('Automação', formatMetric(kpis.automationDevices))}
        ${kpi('Sensores', formatMetric(kpis.sensingDevices))}
      </div>
    </section>`;
}

export function renderConclusion(data: SimpleReportData): string {
  const items = data.conclusion.recommendations
    .map((text) => `<li>${escapeHtml(text)}</li>`)
    .join('');
  return `
    <section class="section">
      <h2>Parecer geral</h2>
      <div class="conclusion">
        <h3>${escapeHtml(data.conclusion.title)}</h3>
        <p>${escapeHtml(data.conclusion.body)}</p>
        ${items ? `<ul>${items}</ul>` : ''}
      </div>
    </section>`;
}

export function renderFooter(data: ReportHeaderData): string {
  return `
    <footer class="report-footer">
      <span>${escapeHtml(data.unitName)}</span>
      <span>Relatório ${escapeHtml(data.reportId)}</span>
    </footer>`;
}
