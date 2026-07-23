import type {
  DetailedDeviceData,
  DetailedReportData,
  DailyTelemetryData,
  TechnicalEventData,
  TechnicalEventKind,
} from '../template/report-data.types';
import {
  BASE_REPORT_CSS,
  escapeHtml,
  formatMetric,
  renderConclusion,
  renderExecutiveSummary,
  renderFooter,
  renderHeader,
  statusClass,
  statusLabel,
} from './report-html.shared';

const DETAILED_REPORT_CSS = `
.heatmap-split{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.heatmap-panel{border:1px solid var(--line);border-radius:var(--radius);padding:12px;background:var(--soft)}
.heatmap-grid{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.heatmap-cell{width:16px;height:16px;border-radius:3px;background:#eef1f4}
.heatmap-cell.ok{background:var(--ok)}
.heatmap-cell.warn{background:var(--warn)}
.heatmap-cell.crit{background:var(--crit)}
.heatmap-cell.muted{background:#c4ccd5}
.device-card{border:1px solid var(--line);border-radius:var(--radius);padding:13px;margin-bottom:12px;background:#fff;break-inside:avoid;page-break-inside:avoid}
.device-card-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.device-id{font-weight:800;font-size:14px}
.device-meta{color:var(--muted);line-height:1.5}
.device-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}
.device-stats .metric{background:var(--soft);border-radius:7px;padding:7px}
.device-stats .metric small{display:block;color:var(--muted);font-size:8px;text-transform:uppercase;margin-bottom:4px}
.device-reason{color:var(--muted);border-top:1px solid var(--line);padding-top:7px;margin-top:4px}
.telemetry-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px}
.telemetry-table th,.telemetry-table td{border:1px solid var(--line);padding:5px 7px;text-align:left}
.telemetry-table thead{background:var(--soft)}
svg.sparkline{display:block;margin-top:8px}
.events-table{width:100%;border-collapse:collapse;font-size:11px}
.events-table th,.events-table td{border:1px solid var(--line);padding:5px 7px;text-align:left}
.events-table thead{background:var(--soft)}
.empty-state{padding:16px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:var(--radius)}
.badge{font-size:9px;font-weight:800;text-transform:uppercase;padding:3px 8px;border-radius:999px}
.badge.ok{background:var(--ok-soft);color:var(--ok)}
.badge.warn{background:var(--warn-soft);color:var(--warn)}
.badge.crit{background:var(--crit-soft);color:var(--crit)}
.badge.muted{background:#eef1f4;color:var(--muted)}
@media print{.telemetry-table thead,.events-table thead{display:table-header-group}}
`;

const EVENT_KIND_LABELS: Record<TechnicalEventKind, string> = {
  DEVICE_ERROR: 'Erro de dispositivo',
  DIAGNOSTIC: 'Diagnóstico',
  NOTE: 'Anotação',
  HEALTH_FLAG: 'Sinalização de saúde',
  BROWNOUT: 'Queda de tensão',
  CHARGE_TREND: 'Tendência de carga',
};

const EVENT_SEVERITY: Record<TechnicalEventData['severity'], string> = {
  INFO: 'muted',
  ATENCAO: 'warn',
  CRITICO: 'crit',
};

export function renderDetailedReportHtml(data: DetailedReportData): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relatório técnico de baterias — ${escapeHtml(data.header.unitName)}</title>
    <style>${BASE_REPORT_CSS}${DETAILED_REPORT_CSS}</style>
  </head>
  <body>
    <main class="sheet report-detailed">
      ${renderHeader(data.header)}
      ${renderExecutiveSummary(data)}
      ${renderConclusion(data)}
      ${renderHeatmap(data)}
      ${renderDeviceSection('Automação', data.automationDevices, 'Nenhum dispositivo de automação no período.')}
      ${renderDeviceSection('Sensoriamento', data.sensingDevices, 'Nenhum dispositivo de sensoriamento no período.')}
      ${renderEvents(data.technicalEvents)}
      ${renderFooter(data.header)}
    </main>
  </body>
</html>`;
}

function renderHeatmap(data: DetailedReportData): string {
  const panel = (title: string, devices: DetailedDeviceData[]): string => {
    const cells = devices
      .map(
        (device) =>
          `<span class="heatmap-cell ${statusClass(device.status)}" title="DIR ${escapeHtml(device.addr)}"></span>`,
      )
      .join('');
    return `
      <div class="heatmap-panel">
        <strong>${escapeHtml(title)}</strong>
        <div class="heatmap-grid">${cells || '<span class="empty-state">Sem dispositivos.</span>'}</div>
      </div>`;
  };

  return `
    <section class="section">
      <h2>Mapa de calor</h2>
      <div class="heatmap-split">
        ${panel('Automação', data.automationDevices)}
        ${panel('Sensoriamento', data.sensingDevices)}
      </div>
    </section>`;
}

function renderDeviceSection(
  title: string,
  devices: DetailedDeviceData[],
  emptyMessage: string,
): string {
  const body = devices.length
    ? devices.map((device) => renderDeviceCard(device)).join('')
    : `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
  return `
    <section class="section">
      <h2>${escapeHtml(title)}</h2>
      ${body}
    </section>`;
}

function renderDeviceCard(device: DetailedDeviceData): string {
  return `
    <article class="device-card">
      <div class="device-card-head">
        <div>
          <div class="device-id">DIR ${escapeHtml(device.addr)}</div>
          <div class="device-meta">${escapeHtml(device.functionLabel)} · ${escapeHtml(device.model)} · ${escapeHtml(device.powerType)}</div>
          <div class="device-meta">Confiança: ${escapeHtml(device.confidence)} · Diagnóstico: ${escapeHtml(device.diagnosis)}</div>
        </div>
        <span class="badge ${statusClass(device.status)}">${escapeHtml(statusLabel(device.status))}</span>
      </div>
      <div class="device-stats">
        <div class="metric"><small>Mínima</small><strong>${formatMetric(device.minimumVoltage, ' V', 2)}</strong></div>
        <div class="metric"><small>Máxima</small><strong>${formatMetric(device.maximumVoltage, ' V', 2)}</strong></div>
        <div class="metric"><small>Média</small><strong>${formatMetric(device.averageVoltage, ' V', 2)}</strong></div>
        <div class="metric"><small>Amostras</small><strong>${formatMetric(device.sampleCount)}</strong></div>
      </div>
      <div class="device-reason">${escapeHtml(device.reason)}</div>
      ${renderSparkline(device.dailyTelemetry)}
      ${renderTelemetryTable(device.dailyTelemetry)}
    </article>`;
}

function renderSparkline(daily: DailyTelemetryData[]): string {
  const scores = daily
    .map((day) => day.healthScore)
    .filter((score): score is number => typeof score === 'number');
  if (scores.length < 2) {
    return '<p class="device-meta">Tendência indisponível</p>';
  }

  const width = 160;
  const height = 30;
  const max = Math.max(...scores, 100);
  const min = Math.min(...scores, 0);
  const span = max - min || 1;
  const points = scores
    .map((score, index) => {
      const x = (index / (scores.length - 1)) * width;
      const y = height - ((score - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return `<svg class="sparkline" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Tendência de saúde"><polyline fill="none" stroke="#b78a32" stroke-width="2" points="${points}"></polyline></svg>`;
}

function renderTelemetryTable(daily: DailyTelemetryData[]): string {
  if (!daily.length) {
    return '<div class="empty-state">Sem telemetria diária disponível.</div>';
  }
  const rows = daily
    .map(
      (day) => `
      <tr>
        <td>${escapeHtml(day.dayLabel)}</td>
        <td>${formatMetric(day.sampleCount)}</td>
        <td>${formatMetric(day.minimumVoltage, ' V', 2)}</td>
        <td>${formatMetric(day.maximumVoltage, ' V', 2)}</td>
        <td>${formatMetric(day.averageVoltage, ' V', 2)}</td>
        <td>${escapeHtml(day.diagnosis)}</td>
        <td>${formatMetric(day.healthScore, '%')}</td>
      </tr>`,
    )
    .join('');
  return `
    <table class="telemetry-table">
      <caption style="text-align:left;font-weight:700;margin-bottom:4px">Telemetria diária</caption>
      <thead>
        <tr>
          <th>Dia</th><th>Amostras</th><th>Mínima</th><th>Máxima</th><th>Média</th><th>Diagnóstico</th><th>Saúde</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderEvents(events: TechnicalEventData[]): string {
  const body = events.length
    ? `
      <table class="events-table">
        <thead>
          <tr><th>Data</th><th>DIR</th><th>Categoria</th><th>Severidade</th><th>Mensagem</th><th>Ocorrências</th></tr>
        </thead>
        <tbody>
          ${events
            .map(
              (event) => `
          <tr>
            <td>${escapeHtml(event.occurredAtLabel)}</td>
            <td>DIR ${escapeHtml(event.deviceAddr)}</td>
            <td>${escapeHtml(EVENT_KIND_LABELS[event.kind])}</td>
            <td><span class="badge ${EVENT_SEVERITY[event.severity]}">${escapeHtml(event.severity)}</span></td>
            <td>${escapeHtml(event.message)}</td>
            <td>${formatMetric(event.count)}</td>
          </tr>`,
            )
            .join('')}
        </tbody>
      </table>`
    : '<div class="empty-state">Nenhum evento técnico registrado.</div>';

  return `
    <section class="section">
      <h2>Eventos técnicos</h2>
      ${body}
    </section>`;
}
