import type {
  BatteryConfidence,
  BatteryDiagnosis,
  BatteryReportItem,
  ReportQueryResult,
} from '../template/legacy-report.types';
import { LOGO_DATA_URI } from '../template/report-logo';
import { NOTE_ICON_DATA_URI } from '../template/report-note-icon';

type DashboardStatus = 'OK' | 'ATENCAO' | 'CRITICO' | 'SEM_DADOS';

type DashboardDailyHealth = {
  day: string;
  dayScore: number;
  diagnosis: BatteryDiagnosis;
};

type DirClassification = 'AUTOMACAO' | 'SENSORIAMENTO';

type HtmlDirFunction = {
  kind?: string;
  label: string;
  columns: string[];
};

type HtmlDirMetadata = {
  classification: DirClassification;
  primaryFunction: HtmlDirFunction;
  functions: HtmlDirFunction[];
  sdiColumns: string[];
  note?: string;
};

type ReportItemWithOptionalDir = BatteryReportItem & {
  dir?: Partial<HtmlDirMetadata> & {
    primaryFunction?: Partial<HtmlDirFunction>;
    functions?: Array<Partial<HtmlDirFunction>>;
  };
};

type DashboardDevice = {
  addr: string;
  hasDataInPeriod: boolean;
  samplesInPeriod: number;
  classification: DirClassification;
  categories: DirClassification[];
  primaryFunctionLabel: string;
  functions: Array<{ label: string; columns: string[] }>;
  sdiColumns: string[];
  tipo: 'SOLAR' | 'FONTE';
  perf: number;
  minV: number;
  status: DashboardStatus;
  diagnosis: BatteryDiagnosis;
  confidence: BatteryConfidence;
  motivo: string;
  daily: DashboardDailyHealth[];
  note?: string;
};

const STATUS_VIEW: Record<
  DashboardStatus,
  { className: 'ok' | 'warn' | 'crit' | 'nodata'; label: string }
> = {
  OK: { className: 'ok', label: 'Saudável' },
  ATENCAO: { className: 'warn', label: 'Atenção' },
  CRITICO: { className: 'crit', label: 'Crítico' },
  SEM_DADOS: { className: 'nodata', label: 'Sem dados no período' },
};

const CATEGORY_VIEW: Record<
  DirClassification,
  { className: 'auto' | 'sense'; short: string; label: string }
> = {
  AUTOMACAO: { className: 'auto', short: 'AUT', label: 'Automação' },
  SENSORIAMENTO: { className: 'sense', short: 'SEN', label: 'Sensor' },
};

const DIAGNOSIS_VIEW: Record<
  BatteryDiagnosis,
  { label: string; color: string }
> = {
  NORMAL: { label: 'Normal', color: 'var(--ok)' },
  BATERIA_FRACA: { label: 'Bateria fraca', color: 'var(--bad)' },
  FALHA_CARGA: { label: 'Falha de carga', color: 'var(--warn)' },
  DESCARGA_EXCESSIVA: {
    label: 'Descarga excessiva',
    color: 'var(--crit)',
  },
  BAIXA_TENSAO_RECENTE: {
    label: 'Baixa tensão recente',
    color: 'var(--gold-deep)',
  },
  DADOS_INSUFICIENTES: {
    label: 'Dados insuficientes',
    color: 'var(--faint)',
  },
};

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Period verdict now comes from the health summary (life-util trend) instead
// of being inferred from a single minBat reading.
function status(item: BatteryReportItem): DashboardStatus {
  if (!item.hasDataInPeriod) return 'SEM_DADOS';
  if (item.health.confidence === 'BAIXA' && item.health.lifeStatus === 'OK') {
    return 'ATENCAO';
  }
  return item.health.lifeStatus;
}

export function calculateOverallHealth(items: BatteryReportItem[]): number {
  const analyzableItems = items.filter((item) => item.hasDataInPeriod);
  if (!analyzableItems.length) return 0;
  const scoreByStatus: Record<DashboardStatus, number> = {
    OK: 100,
    ATENCAO: 50,
    CRITICO: 0,
    SEM_DADOS: 0,
  };
  const total = analyzableItems.reduce(
    (sum, item) => sum + scoreByStatus[status(item)],
    0,
  );
  return round(total / analyzableItems.length, 1);
}

function diagnosis(item: BatteryReportItem): BatteryDiagnosis {
  if (status(item) === 'OK') {
    return 'NORMAL';
  }
  if (
    item.health.confidence === 'BAIXA' &&
    item.health.diagnosis === 'NORMAL'
  ) {
    return 'DADOS_INSUFICIENTES';
  }
  return item.health.diagnosis;
}

function reason(item: BatteryReportItem): string {
  if (item.health.reasons.length) {
    return item.health.reasons.join(' · ');
  }
  // Fallback to the legacy reasons while data is migrating.
  return item.tipo === 'FONTE'
    ? item.motivo
    : [item.motivoBateria, item.motivoCarga].filter(Boolean).join(' | ');
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function dayScoreClass(score: number): 'ok' | 'warn' | 'bad' | 'crit' {
  if (score >= 85) return 'ok';
  if (score >= 70) return 'warn';
  if (score >= 50) return 'bad';
  return 'crit';
}

// Static daily-trend sparkline: one mini-bar per valid day, height by dayScore,
// color by the day's status band. Capped to the most recent 14 days.
function sparkline(daily: DashboardDailyHealth[]): string {
  if (!daily.length) return '<span class="motivo">—</span>';
  const recent = daily.slice(-14);
  const bars = recent
    .map(
      (day) =>
        `<i class="${dayScoreClass(day.dayScore)}" style="height:${Math.max(
          day.dayScore,
          6,
        )}%"></i>`,
    )
    .join('');
  return `<div class="spark" title="${recent.length} dias">${bars}</div>`;
}

function deviceIdentity(addr: string | number, functionLabel: string): string {
  const normalized =
    typeof addr === 'number' ? String(addr).padStart(3, '0') : addr;
  return `DIR ${normalized} - ${functionLabel}`;
}

const UNKNOWN_FUNCTION_LABEL = 'Sem funcao cadastrada';

// Used only when an item reaches the renderer without DB-provided DIR metadata
// (should not happen in production). It carries no invented function so the
// report never shows a classification the database did not register.
function unknownDirMetadata(): HtmlDirMetadata {
  return {
    classification: 'AUTOMACAO',
    primaryFunction: { label: UNKNOWN_FUNCTION_LABEL, columns: [] },
    functions: [],
    sdiColumns: [],
  };
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeDirFunction(value: unknown): HtmlDirFunction | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<HtmlDirFunction>;
  if (typeof candidate.label !== 'string' || !candidate.label.trim()) {
    return null;
  }
  return {
    kind: typeof candidate.kind === 'string' ? candidate.kind : undefined,
    label: candidate.label,
    columns: normalizeStringArray(candidate.columns),
  };
}

function normalizeDirMetadata(item: BatteryReportItem): HtmlDirMetadata {
  const dir = (item as ReportItemWithOptionalDir).dir;
  if (!dir) return unknownDirMetadata();

  // Functions and columns come straight from the database query result; nothing
  // is invented here. Only entries the DB actually registered are kept.
  const functions = Array.isArray(dir.functions)
    ? dir.functions
        .map(normalizeDirFunction)
        .filter((func): func is HtmlDirFunction => func !== null)
    : [];
  const primaryFunction = normalizeDirFunction(dir.primaryFunction) ??
    functions[0] ?? { label: UNKNOWN_FUNCTION_LABEL, columns: [] };

  const note =
    typeof dir.note === 'string' && dir.note.trim()
      ? dir.note.trim()
      : undefined;

  return {
    classification:
      dir.classification === 'SENSORIAMENTO' ? 'SENSORIAMENTO' : 'AUTOMACAO',
    primaryFunction,
    functions,
    sdiColumns: normalizeStringArray(dir.sdiColumns),
    ...(note ? { note } : {}),
  };
}

// Derive which categories the device actually carries from its DB-registered
// function kinds, so a device with both automation outputs and sensor inputs
// shows both badges. Falls back to the stored classification when kinds are
// absent.
function dirCategories(dir: HtmlDirMetadata): DirClassification[] {
  const present = new Set<DirClassification>();
  for (const func of dir.functions) {
    if (func.kind === 'AUTOMACAO') present.add('AUTOMACAO');
    else if (func.kind?.startsWith('SENSOR')) present.add('SENSORIAMENTO');
  }
  if (!present.size) present.add(dir.classification);
  return (['AUTOMACAO', 'SENSORIAMENTO'] as DirClassification[]).filter(
    (category) => present.has(category),
  );
}

function toDashboardDevice(item: BatteryReportItem): DashboardDevice {
  const dir = normalizeDirMetadata(item);
  return {
    addr: String(item.addr).padStart(3, '0'),
    hasDataInPeriod: item.hasDataInPeriod,
    samplesInPeriod: item.samplesInPeriod,
    classification: dir.classification,
    categories: dirCategories(dir),
    primaryFunctionLabel: dir.primaryFunction.label,
    functions: dir.functions.map((func) => ({
      label: func.label,
      columns: func.columns,
    })),
    sdiColumns: dir.sdiColumns,
    tipo: item.tipo,
    perf: round(item.health.healthScore, 1),
    minV: round(item.minBat, 2),
    status: status(item),
    diagnosis: diagnosis(item),
    confidence: item.health.confidence,
    motivo: reason(item),
    daily: item.health.daily.map((day) => ({
      day: day.day,
      dayScore: day.dayScore,
      diagnosis: day.diagnosis,
    })),
    ...(dir.note ? { note: dir.note } : {}),
  };
}

function deviceOrder(device: DashboardDevice): number {
  return { CRITICO: 0, ATENCAO: 1, OK: 2, SEM_DADOS: 3 }[device.status];
}

function sortDashboardDevices(devices: DashboardDevice[]): DashboardDevice[] {
  return [...devices].sort(
    (a, b) => deviceOrder(a) - deviceOrder(b) || a.perf - b.perf,
  );
}

function renderCategoryBadges(categories: DirClassification[]): string {
  return categories
    .map((category) => {
      const view = CATEGORY_VIEW[category];
      return `<span class="cat ${view.className}">${view.short}</span>`;
    })
    .join('');
}

// A heatmap cell always shows the battery-health percentage. Sensor cells also
// print the sensor name in use (from the DB-derived function label); automation
// cells omit it, since automation devices carry no sensor card.
function renderHeatmapCell(
  device: DashboardDevice,
  showSensorName: boolean,
): string {
  const statusView = STATUS_VIEW[device.status];
  const diagnosisView = DIAGNOSIS_VIEW[device.diagnosis];
  const identity = deviceIdentity(device.addr, device.primaryFunctionLabel);
  const categoryLabels = device.categories
    .map((category) => CATEGORY_VIEW[category].label)
    .join(' + ');
  const title = `${identity} - ${device.tipo} - ${statusView.label}
Categoria: ${categoryLabels}
Diagnostico: ${diagnosisView.label} - Confianca: ${device.confidence}
${device.motivo}`;
  const sensorName =
    showSensorName && device.primaryFunctionLabel
      ? `<span class="sensor-name" title="${escapeHtml(
          device.primaryFunctionLabel,
        )}">${escapeHtml(device.primaryFunctionLabel)}</span>`
      : '';
  // Icon marker indexing every DIR that carries a registered CAD_DIR change.
  // Icon only: the note text stays in the hero, the marker just flags the addr.
  const noteMarker = device.note
    ? `<span class="note-flag" title="Mudança registrada" role="img" aria-label="Mudança registrada"></span>`
    : '';
  const performance = device.hasDataInPeriod
    ? `${Math.round(device.perf)}<span style="font-size:9px">%</span>`
    : '<span class="no-data-label">FALTA DE DADOS<br>NO PERÍODO</span>';
  return `<div class="cell ${statusView.className}${
    device.note ? ' has-note' : ''
  }" title="${escapeHtml(title)}">
        <span class="pin"></span>
        ${noteMarker}
        <div class="chead">
          <span class="addr mono">DIR ${escapeHtml(device.addr)}</span>
          ${sensorName}
        </div>
        <span class="perf mono">${performance}</span>
      </div>`;
}

function renderHeatmapArea(
  title: string,
  devices: DashboardDevice[],
  variant: 'auto' | 'sense',
): string {
  const testId = variant === 'auto' ? 'heatmap-automation' : 'heatmap-sensors';
  const cells = devices.length
    ? devices
        .map((device) => renderHeatmapCell(device, variant === 'sense'))
        .join('')
    : '<div class="heat-empty">Nenhum dispositivo nesta categoria.</div>';
  const countLabel = `${devices.length} ${
    devices.length === 1 ? 'dispositivo' : 'dispositivos'
  }`;
  return `<div class="heat-area ${variant}">
        <div class="heat-area-head">
          <span class="ha-title">${escapeHtml(title)}</span>
          <span class="ha-count">${countLabel}</span>
        </div>
        <div class="heat" data-testid="${testId}">${cells}</div>
      </div>`;
}

function renderCauseBars(devices: DashboardDevice[]): string {
  const diagnoses = Object.entries(DIAGNOSIS_VIEW) as Array<
    [BatteryDiagnosis, { label: string; color: string }]
  >;
  const counts = diagnoses.map(([key]) => ({
    key,
    count: devices.filter((device) => device.diagnosis === key).length,
  }));
  const max = Math.max(...counts.map((item) => item.count), 1);

  return counts
    .map(({ key, count }) => {
      const view = DIAGNOSIS_VIEW[key];
      return `<div class="hbar" data-diagnosis="${key}" data-count="${count}">
        <div class="top"><span class="l">${view.label}</span><span class="v mono">${count}</span></div>
        <div class="track"><i style="width:${(count / max) * 100}%;background:${view.color}"></i></div>
      </div>`;
    })
    .join('');
}

// Serialize for safe embedding inside a <script> block (avoids </script> and
// line-separator breakouts).
function toJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function reportId(iso: string): string {
  const date = new Date(iso);
  const base = Number.isNaN(date.getTime()) ? new Date() : date;
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const dd = String(base.getDate()).padStart(2, '0');
  return `REL-${base.getFullYear()}-${mm}${dd}`;
}

function clientName(report: ReportQueryResult): string {
  const names = Array.from(new Set(report.items.map((item) => item.cliente)));
  if (names.length === 0) return '—';
  if (names.length === 1) return names[0];
  return `${names.length} fazendas`;
}

// Full-width section below the hero: every DIR that carries a CAD_DIR change,
// worst-first, as cards flowing side-to-side. Text from the DB is escaped. The
// empty state stays compact and drops the grid and icon legend.
function renderChangesSection(changed: DashboardDevice[]): string {
  const legend = changed.length
    ? `<div class="note changes-legend"><span class="ico" role="img" aria-label="Mudança registrada"></span>O icone indica mudança feita</div>`
    : '';
  const body = changed.length
    ? `<div class="changes-grid">${changed
        .map(
          (device) =>
            `<div class="change-card"><span class="ico" role="img" aria-label="Mudança registrada"></span><div class="cc-body"><b>DIR ${escapeHtml(
              device.addr,
            )}</b><p>${escapeHtml(device.note)}</p></div></div>`,
        )
        .join('')}</div>`
    : `<div class="changes-empty">Sem mudança registrada</div>`;
  return `<section class="changes-section">
      <div class="sec-head">
        <div>
          <div class="eyebrow">Registro de campo</div>
          <h2>Mudanças registradas</h2>
        </div>
        ${legend}
      </div>
      ${body}
    </section>`;
}

function renderInventoryMiniCard(device: DashboardDevice): string {
  const statusView = STATUS_VIEW[device.status];
  const diagnosisView = DIAGNOSIS_VIEW[device.diagnosis];
  const metrics = device.hasDataInPeriod
    ? `<div class="imc-metrics">
          <span><b class="mono">${device.perf.toFixed(1)}%</b><small>saude</small></span>
          <span><b class="mono">${device.minV.toFixed(2)} V</b><small>min.</small></span>
          <span class="forecast-metric"><small>previsão</small>${sparkline(device.daily)}</span>
          <span><b style="color:${diagnosisView.color}">${escapeHtml(diagnosisView.label)}</b><small>diagnostico</small></span>
        </div>`
    : `<div class="imc-metrics no-data-metric">
          <span><b>FALTA DE DADOS</b><small>no período selecionado</small></span>
        </div>`;
  return `<article class="inventory-mini-card ${statusView.className}">
        <div class="imc-main">
          <div>
            <span class="dev-id">${escapeHtml(deviceIdentity(device.addr, device.primaryFunctionLabel))}</span>
            <span class="dev-cats">${renderCategoryBadges(device.categories)}</span>
          </div>
          <span class="badge ${statusView.className}"><i></i>${escapeHtml(statusView.label)}</span>
        </div>
        ${metrics}
        <p class="motivo">${escapeHtml(device.motivo)}</p>
      </article>`;
}

function renderInventoryPanel(
  title: string,
  devices: DashboardDevice[],
  variant: 'auto' | 'sense',
): string {
  const countLabel = `${devices.length} ${
    devices.length === 1 ? 'dispositivo' : 'dispositivos'
  }`;
  const cards = devices.length
    ? devices.map(renderInventoryMiniCard).join('')
    : '<div class="inventory-empty">Nenhum dispositivo nesta categoria.</div>';
  const testId =
    variant === 'auto' ? 'inventory-automation' : 'inventory-sensors';
  return `<div class="inventory-panel ${variant}">
        <div class="inventory-panel-head">
          <span class="inventory-title">${escapeHtml(title)}</span>
          <span class="inventory-count">${countLabel}</span>
        </div>
        <div class="inventory-card-grid" id="${testId}" data-testid="${testId}">${cards}</div>
      </div>`;
}

export function renderReportHtml(report: ReportQueryResult): string {
  const devices = report.items.map(toDashboardDevice);
  // Classification is decided in ReportQueryService from the NEWSIR CAD_DIR
  // rules; the heatmap only splits the already-classified devices into two
  // visual areas.
  const automationDevices = sortDashboardDevices(
    devices.filter((device) => device.classification === 'AUTOMACAO'),
  );
  const sensorDevices = sortDashboardDevices(
    devices.filter((device) => device.classification === 'SENSORIAMENTO'),
  );
  const devicesJson = toJsonForScript(devices);
  const cliente = clientName(report);
  const geradoEm = formatGeneratedAt(report.generatedAt);
  const periodo =
    report.hours !== undefined
      ? `${report.hours} ${report.hours === 1 ? 'hora' : 'horas'}`
      : `${report.days} dias`;
  const relatorioId = reportId(report.generatedAt);
  const heatmapSplit = `<div class="heat-split">
        ${renderHeatmapArea('Automação', automationDevices, 'auto')}
        ${renderHeatmapArea('Sensores', sensorDevices, 'sense')}
      </div>`;
  const causeBars = renderCauseBars(devices);
  const overallHealth = calculateOverallHealth(report.items);
  const changesSection = renderChangesSection(
    sortDashboardDevices(devices.filter((device) => device.note)),
  );

  const inventorySplit = `<div class="inventory-split">
        ${renderInventoryPanel('Automação', automationDevices, 'auto')}
        ${renderInventoryPanel('Sensoriamento', sensorDevices, 'sense')}
      </div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Laudo de Saúde de Baterias — ${escapeHtml(cliente)}</title>
<style>
  :root{
    --gold:#E8AC30; --gold-deep:#B9791A; --gold-soft:#FBF1D8; --gold-tint:#FDF8EC;
    --ok:#2E9E6B; --ok-soft:#E7F4EC; --ok-deep:#1F7A50;
    --warn:#D99519; --warn-soft:#FBF0D6;
    --bad:#E07A2E; --bad-soft:#FBEBDD; --bad-deep:#B85F1E;
    --crit:#D2453B; --crit-soft:#FBE8E6; --crit-deep:#A8312A;
    --ink:#211D17; --ink2:#4C463D; --muted:#8B8278; --faint:#B6AEA3;
    --line:#EAE4DB; --line2:#F3EFE8; --paper:#FFFFFF; --bg:#ECE7DF;
    --r:14px;
  }
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{
    font-family:'IBM Plex Sans',sans-serif;
    background:var(--bg);
    color:var(--ink);
    -webkit-font-smoothing:antialiased;
    line-height:1.45;
  }
  .mono{font-family:'IBM Plex Mono',monospace;font-feature-settings:"tnum" 1;}
  .sheet{
    width:880px;max-width:100%;margin:34px auto;background:var(--paper);
    padding:46px 50px 56px;border-radius:6px;
    box-shadow:0 1px 2px rgba(33,29,23,.06),0 18px 50px -22px rgba(33,29,23,.28);
  }
  section{margin-top:34px;}

  /* ---------- toolbar ---------- */
  .toolbar{position:fixed;top:18px;right:18px;z-index:50;display:flex;gap:8px;}
  .btn{
    display:inline-flex;align-items:center;gap:8px;border:none;cursor:pointer;
    background:var(--ink);color:#fff;font-family:inherit;font-weight:600;font-size:13px;
    padding:10px 16px;border-radius:10px;box-shadow:0 6px 18px -6px rgba(33,29,23,.5);
    transition:transform .12s ease, background .12s ease;
  }
  .btn:hover{background:#000;}
  .btn:active{transform:scale(.96);}
  .btn svg{width:15px;height:15px;}

  /* ---------- header ---------- */
  .doc-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;
    padding-bottom:18px;border-bottom:2px solid var(--ink);}
  .doc-head img{height:34px;width:auto;display:block;}
  .doc-head .right{text-align:right;}
  .kicker{font-size:10.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);}
  .doc-head .right .id{font-size:13px;font-weight:600;color:var(--ink2);margin-top:2px;}

  /* ---------- title block ---------- */
  .title-row{display:flex;justify-content:space-between;align-items:flex-end;gap:32px;margin-top:26px;}
  h1{font-size:33px;line-height:1.08;font-weight:700;letter-spacing:-.02em;margin:0;max-width:18ch;}
  h1 .accent{color:var(--gold-deep);}
  .sub{font-size:13.5px;color:var(--ink2);margin-top:12px;display:flex;flex-wrap:wrap;gap:6px 18px;}
  .sub b{color:var(--ink);font-weight:600;}
  .sub .sep{color:var(--faint);}

  /* ---------- health hero ---------- */
  .hero{display:grid;grid-template-columns:auto 1fr;gap:26px;align-items:center;
    background:linear-gradient(180deg,var(--gold-tint),#fff);
    border:1px solid var(--line);border-radius:var(--r);padding:22px 26px;}
  .gauge{position:relative;width:118px;height:118px;flex:none;}
  .gauge svg{transform:rotate(-90deg);}
  .gauge .num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}
  .gauge .num b{font-size:30px;font-weight:700;letter-spacing:-.02em;}
  .gauge .num span{font-size:9.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-top:-2px;}
  .hero .meta h3{margin:0;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-deep);}
  .hero .meta .verdict{font-size:22px;font-weight:700;letter-spacing:-.01em;margin:3px 0 6px;}
  .hero .meta p{margin:0;font-size:12.5px;color:var(--ink2);max-width:46ch;}
  .hero .stat-mini{display:flex;flex-wrap:wrap;gap:14px 26px;margin-top:14px;}
  .hero .stat-mini div{min-width:0;}
  .hero .stat-mini div span{display:block;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);}
  .hero .stat-mini div b{font-size:18px;font-weight:700;}

  /* ---------- registered changes ---------- */
  .changes-legend{display:flex;align-items:center;gap:7px;}
  .changes-legend .ico{width:13px;height:13px;flex:none;
    background:url('${NOTE_ICON_DATA_URI}') center/contain no-repeat;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .changes-empty{font-size:12px;color:var(--muted);}
  .changes-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;}
  .change-card{display:grid;grid-template-columns:16px 1fr;gap:10px;align-items:start;
    border:1px solid var(--line);border-radius:var(--r);padding:12px 14px;background:#fff;
    break-inside:avoid;page-break-inside:avoid;}
  .change-card .ico{width:14px;height:14px;margin-top:2px;
    background:url('${NOTE_ICON_DATA_URI}') center/contain no-repeat;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .change-card .cc-body{min-width:0;}
  .change-card b{display:block;font-size:12px;font-weight:700;color:var(--ink);}
  .change-card p{margin:2px 0 0;font-size:11.5px;line-height:1.35;color:var(--ink2);
    overflow-wrap:anywhere;word-break:break-word;}

  /* ---------- kpi cards ---------- */
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
  .kpi{border:1px solid var(--line);border-radius:var(--r);padding:15px 16px;position:relative;overflow:hidden;background:#fff;}
  .kpi .tag{display:inline-flex;align-items:center;gap:7px;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;}
  .kpi .dot{width:9px;height:9px;border-radius:50%;}
  .kpi .big{font-size:34px;font-weight:700;letter-spacing:-.02em;line-height:1;margin:10px 0 2px;}
  .kpi .big small{font-size:13px;font-weight:600;color:var(--muted);letter-spacing:0;}
  .kpi .desc{font-size:11.5px;color:var(--ink2);}
  .kpi .bar{height:4px;border-radius:3px;background:var(--line2);margin-top:12px;overflow:hidden;}
  .kpi .bar i{display:block;height:100%;border-radius:3px;}
  .kpi.ok .tag,.kpi.ok .big small.c{color:var(--ok-deep);} .kpi.ok .dot{background:var(--ok);} .kpi.ok .bar i{background:var(--ok);}
  .kpi.warn .tag{color:var(--warn);} .kpi.warn .dot{background:var(--warn);} .kpi.warn .bar i{background:var(--warn);}
  .kpi.bad .tag{color:var(--bad-deep);} .kpi.bad .dot{background:var(--bad);} .kpi.bad .bar i{background:var(--bad);}
  .kpi.crit .tag{color:var(--crit-deep);} .kpi.crit .dot{background:var(--crit);} .kpi.crit .bar i{background:var(--crit);}

  /* ---------- section heading ---------- */
  .sec-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:16px;}
  .sec-head h2{margin:0;font-size:18px;font-weight:700;letter-spacing:-.01em;}
  .sec-head .eyebrow{font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--gold-deep);margin-bottom:3px;}
  .sec-head .note{font-size:11.5px;color:var(--muted);}

  /* ---------- heatmap ---------- */
  .legend{display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:var(--ink2);align-items:center;}
  .legend i{width:10px;height:10px;border-radius:3px;display:inline-block;margin-right:6px;vertical-align:-1px;}
  .heat-section{break-inside:avoid;page-break-inside:avoid;}
  /* automation (left) vs sensors (right) split */
  .heat-split{display:grid;grid-template-columns:1fr 1fr;gap:13px;align-items:start;}
  .heat-area{border:1px solid var(--line);border-radius:var(--r);padding:12px;background:#fff;min-width:0;}
  .heat-area.auto{border-top:3px solid var(--gold-deep);}
  .heat-area.sense{border-top:3px solid var(--ok);}
  .heat-area-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:10px;}
  .ha-title{font-size:11.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;}
  .heat-area.auto .ha-title{color:var(--gold-deep);}
  .heat-area.sense .ha-title{color:var(--ok-deep);}
  .ha-count{font-size:10px;color:var(--muted);white-space:nowrap;}
  .heat-empty{padding:16px 8px;color:var(--muted);font-size:11px;text-align:center;}
  .heat{display:grid;grid-template-columns:repeat(auto-fill,minmax(74px,1fr));gap:6px;}
  .cell{border-radius:9px;padding:7px 7px 8px;border:1px solid;min-height:52px;display:flex;flex-direction:column;justify-content:space-between;position:relative;break-inside:avoid;page-break-inside:avoid;}
  .cell .chead{display:flex;flex-direction:column;gap:3px;padding-right:12px;}
  .cell .addr{font-size:9px;font-weight:600;letter-spacing:0;opacity:.85;line-height:1.2;overflow-wrap:anywhere;}
  .cell .sensor-name{font-size:8px;font-weight:700;line-height:1.15;overflow-wrap:anywhere;word-break:break-word;opacity:.92;}
  .cell .cats{display:flex;flex-wrap:wrap;gap:3px;}
  .cat{display:inline-flex;font-size:7.5px;font-weight:800;letter-spacing:.03em;padding:1px 4px;border-radius:4px;line-height:1.5;background:rgba(255,255,255,.85);border:1px solid currentColor;white-space:nowrap;}
  .cat.auto{color:var(--gold-deep);}
  .cat.sense{color:var(--ok-deep);}
  .cell .perf{font-size:16px;font-weight:700;letter-spacing:-.02em;}
  .cell .pin{position:absolute;top:8px;right:8px;width:7px;height:7px;border-radius:50%;}
  .cell .note-flag{position:absolute;top:5px;right:18px;width:13px;height:13px;opacity:.92;
    background:url('${NOTE_ICON_DATA_URI}') center/contain no-repeat;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .cell.has-note .chead{padding-right:32px;}
  .cell.ok{background:var(--ok-soft);border-color:#cfe7da;color:var(--ok-deep);} .cell.ok .pin{background:var(--ok);}
  .cell.warn{background:var(--gold-soft);border-color:#eed9a8;color:var(--gold-deep);} .cell.warn .pin{background:var(--warn);}
  .cell.bad{background:var(--bad-soft);border-color:#f0d2b6;color:var(--bad-deep);} .cell.bad .pin{background:var(--bad);}
  .cell.crit{background:var(--crit-soft);border-color:#f0cdc9;color:var(--crit-deep);} .cell.crit .pin{background:var(--crit);}
  .cell.nodata,.inventory-mini-card.nodata{background:#f3f4f6;border-color:#9ca3af;color:#4b5563;}
  .cell.nodata .pin{background:#6b7280;}
  .no-data-label{display:inline-block;font-size:8px;line-height:1.15;font-weight:800;color:#4b5563;white-space:normal;}

  /* ---------- chart grid ---------- */
  .cols{display:grid;gap:16px;}
  .c-3{grid-template-columns:repeat(3,1fr);}
  .c-2{grid-template-columns:1fr 1fr;}
  .c-12{grid-template-columns:1.15fr 1fr;}
  .panel{border:1px solid var(--line);border-radius:var(--r);padding:18px 20px;background:#fff;break-inside:avoid;}
  .panel h4{margin:0 0 2px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);}
  .panel h3{margin:0 0 14px;font-size:15.5px;font-weight:700;letter-spacing:-.01em;}

  /* doughnut */
  .donut-wrap{display:flex;align-items:center;gap:18px;}
  .donut{position:relative;width:128px;height:128px;flex:none;}
  .donut svg{transform:rotate(-90deg);}
  .donut .ctr{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}
  .donut .ctr b{font-size:26px;font-weight:700;letter-spacing:-.02em;}
  .donut .ctr span{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);}
  .dleg{display:flex;flex-direction:column;gap:11px;flex:1;}
  .dleg .row{display:flex;align-items:center;gap:9px;font-size:12.5px;}
  .dleg .row i{width:11px;height:11px;border-radius:3px;flex:none;}
  .dleg .row .lab{flex:1;color:var(--ink2);}
  .dleg .row b{font-weight:700;}
  .dleg .row .pc{color:var(--muted);font-size:11px;width:42px;text-align:right;}

  /* hbars */
  .hbar{margin-bottom:14px;}
  .hbar:last-child{margin-bottom:0;}
  .hbar .top{display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;}
  .hbar .top .l{color:var(--ink2);font-weight:600;}
  .hbar .top .v{font-weight:700;}
  .hbar .track{height:9px;border-radius:5px;background:var(--line2);overflow:hidden;}
  .hbar .track i{display:block;height:100%;border-radius:5px;}

  /* histogram */
  .histo{display:flex;align-items:flex-end;gap:9px;height:140px;padding-top:8px;}
  .histo .col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:6px;}
  .histo .col .cnt{font-size:13px;font-weight:700;}
  .histo .col .b{width:100%;border-radius:5px 5px 2px 2px;min-height:3px;}
  .histo .col .x{font-size:9.5px;color:var(--muted);font-weight:600;letter-spacing:.02em;white-space:nowrap;}
  .histo-axis{display:flex;justify-content:space-between;font-size:10px;color:var(--faint);margin-top:6px;border-top:1px solid var(--line2);padding-top:6px;}

  /* rank list */
  .rank .row{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--line2);}
  .rank .row:last-child{border-bottom:none;}
  .rank .pos{font-size:11px;font-weight:700;color:var(--faint);width:16px;}
  .rank .name{font-weight:600;font-size:11px;width:128px;line-height:1.2;}
  .rank .diag{font-size:10px;color:var(--muted);width:96px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .rank .track{flex:1;height:8px;border-radius:5px;background:var(--line2);overflow:hidden;}
  .rank .track i{display:block;height:10se0%;border-radius:5px;}
  .rank .val{font-size:12px;font-weight:700;width:48px;text-align:right;}

  /* callout panels */
  .callout{border-radius:var(--r);padding:18px 20px;border:1px solid;break-inside:avoid;}
  .callout.gold{background:var(--gold-tint);border-color:#eed9a8;}
  .callout.red{background:var(--crit-soft);border-color:#f0cdc9;}
  .callout h4{margin:0 0 2px;font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;}
  .callout.gold h4{color:var(--gold-deep);} .callout.red h4{color:var(--crit-deep);}
  .callout h3{margin:0 0 8px;font-size:15.5px;font-weight:700;letter-spacing:-.01em;}
  .callout p{margin:0 0 12px;font-size:12.5px;color:var(--ink2);}
  .callout p b{color:var(--ink);}
  .chips{display:flex;flex-wrap:wrap;gap:6px;}
  .chip{font-size:11px;font-weight:600;padding:3px 9px;border-radius:7px;background:#fff;border:1px solid;}
  .callout.gold .chip{border-color:#eed9a8;color:var(--gold-deep);}
  .callout.red .chip{border-color:#f0cdc9;color:var(--crit-deep);}
  .callout .foot{display:flex;align-items:center;gap:8px;margin-top:14px;font-size:12px;font-weight:600;padding-top:12px;border-top:1px solid;}
  .callout.gold .foot{border-color:#eed9a8;color:var(--gold-deep);}
  .callout.red .foot{border-color:#f0cdc9;color:var(--crit-deep);}
  .callout .foot svg{width:15px;height:15px;flex:none;}

  /* ---------- device inventory ---------- */
  .inventory-wrap{border:1px solid var(--line);border-radius:var(--r);overflow:hidden;background:#fff;}
  .inventory-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 20px;border-bottom:1px solid var(--line);flex-wrap:wrap;}
  .inventory-head .filters{display:flex;gap:8px;flex-wrap:wrap;}
  .inventory-head input,.inventory-head select{font-family:inherit;font-size:12px;font-weight:500;color:var(--ink);
    border:1px solid var(--line);background:#fff;border-radius:9px;padding:7px 11px;outline:none;}
  .inventory-head input:focus,.inventory-head select:focus{border-color:var(--gold);box-shadow:0 0 0 3px var(--gold-soft);}
  .inventory-head input{width:150px;}
  .inventory-split{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:16px;background:#FBFAF7;}
  .inventory-panel{border:1px solid var(--line);border-radius:var(--r);overflow:hidden;background:linear-gradient(180deg,var(--gold-tint),#fff);break-inside:avoid;}
  .inventory-panel.sense{background:linear-gradient(180deg,var(--ok-soft),#fff);}
  .inventory-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px;border-bottom:1px solid var(--line);}
  .inventory-title{font-size:13px;font-weight:800;letter-spacing:-.01em;}
  .inventory-count{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);}
  .inventory-card-grid{display:grid;gap:8px;padding:10px;}
  .inventory-mini-card{border:1px solid var(--line);border-left:4px solid var(--faint);border-radius:10px;background:#fff;padding:9px;break-inside:avoid;}
  .inventory-mini-card.ok{border-left-color:var(--ok);}
  .inventory-mini-card.warn{border-left-color:var(--warn);}
  .inventory-mini-card.crit{border-left-color:var(--crit);}
  .inventory-mini-card.nodata{border-left-color:#6b7280;}
  .imc-main{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:7px;}
  .imc-metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;}
  .imc-metrics span{min-width:0;padding:6px 7px;border-radius:8px;background:#FBFAF7;border:1px solid var(--line2);}
  .no-data-metric{grid-template-columns:1fr;}
  .no-data-metric span{grid-column:1/-1;}
  .no-data-metric b{font-size:10px;color:#4b5563;}
  .imc-metrics b{display:block;font-size:11px;line-height:1.2;overflow-wrap:anywhere;}
  .imc-metrics small{display:block;margin-top:1px;font-size:7.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);}
  .forecast-metric{display:flex;flex-direction:column;gap:3px;}
  .forecast-metric small{margin:0;}
  .forecast-metric .spark{height:18px;}
  .inventory-mini-card .motivo{margin:7px 0 0;padding-top:6px;border-top:1px solid var(--line2);}
  .inventory-empty{padding:24px 12px;text-align:center;color:var(--muted);font-size:12px;}
  .badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;padding:3px 9px;border-radius:7px;white-space:nowrap;}
  .badge i{width:6px;height:6px;border-radius:50%;}
  .badge.ok{background:var(--ok-soft);color:var(--ok-deep);} .badge.ok i{background:var(--ok);}
  .badge.warn{background:var(--gold-soft);color:var(--gold-deep);} .badge.warn i{background:var(--warn);}
  .badge.bad{background:var(--bad-soft);color:var(--bad-deep);} .badge.bad i{background:var(--bad);}
  .badge.crit{background:var(--crit-soft);color:var(--crit-deep);} .badge.crit i{background:var(--crit);}

  /* ---------- daily sparkline ---------- */
  .spark{display:flex;align-items:flex-end;gap:2px;height:26px;}
  .spark i{flex:1;min-width:2px;border-radius:2px 2px 0 0;background:var(--line);}
  .spark i.ok{background:var(--ok);} .spark i.warn{background:var(--warn);}
  .spark i.bad{background:var(--bad);} .spark i.crit{background:var(--crit);}

  /* ---------- confidence banner ---------- */
  .conf-note{display:flex;align-items:flex-start;gap:11px;border:1px solid #eed9a8;
    background:var(--gold-tint);border-radius:var(--r);padding:13px 16px;margin-bottom:16px;font-size:12px;color:var(--ink2);}
  .conf-note b{color:var(--gold-deep);}
  .conf-note svg{width:16px;height:16px;flex:none;color:var(--gold-deep);margin-top:1px;}
  .conf-pill{display:inline-flex;font-size:10px;font-weight:700;letter-spacing:.04em;padding:2px 7px;border-radius:6px;white-space:nowrap;}
  .conf-pill.ALTA{background:var(--ok-soft);color:var(--ok-deep);}
  .conf-pill.MEDIA{background:var(--gold-soft);color:var(--gold-deep);}
  .conf-pill.BAIXA{background:var(--line2);color:var(--muted);}
  .perf-cell{display:flex;align-items:center;gap:9px;flex-wrap:wrap;}
  .perf-cell .mini{flex:1;min-width:36px;max-width:54px;height:5px;border-radius:4px;background:var(--line2);overflow:hidden;}
  .perf-cell .mini i{display:block;height:100%;border-radius:4px;}
  .type-pill{display:inline-flex;font-size:10px;font-weight:700;letter-spacing:.04em;padding:2px 8px;border-radius:6px;background:#F1EDE6;color:var(--ink2);white-space:nowrap;}
  .dev-cell{display:flex;flex-direction:column;gap:5px;min-width:0;}
  .dev-id{font-family:'IBM Plex Mono',monospace;font-feature-settings:"tnum" 1;font-weight:600;font-size:12px;line-height:1.25;overflow-wrap:anywhere;white-space:normal;word-break:break-word;}
  .dev-cats{display:flex;flex-wrap:wrap;gap:4px;}
  .motivo{color:var(--ink2);font-size:11.5px;white-space:normal;overflow-wrap:anywhere;word-break:break-word;}
  .empty-row td{text-align:center;color:var(--muted);padding:34px;font-size:13px;}

  /* ---------- footer ---------- */
  .doc-foot{margin-top:30px;padding-top:16px;border-top:1px solid var(--line);
    display:flex;justify-content:space-between;align-items:center;gap:16px;
    font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);}
  .doc-foot img{height:16px;opacity:.65;}

  /* ---------- print ---------- */
  @page{size:A4;margin:13mm;}
  @media print{
    body{background:#fff;}
    .toolbar{display:none !important;}
    .sheet{width:auto;max-width:none;margin:0;padding:0;box-shadow:none;border-radius:0;}
    .no-print{display:none !important;}
    .page-break{break-before:page;}
    .panel,.kpi,.callout,.cell,.inventory-wrap,.hero{box-shadow:none;}
    .inventory-wrap{overflow:visible;}
    .inventory-split{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0;background:transparent;}
    .inventory-panel{break-inside:auto;page-break-inside:auto;margin-bottom:14px;}
    .inventory-card-grid{display:block;}
    .inventory-mini-card{page-break-inside:avoid;margin-bottom:8px;}
    section{margin-top:24px;}
  }
</style>
</head>
<body>

  <div class="toolbar no-print">
    <button class="btn" onclick="window.print()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-4a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2h-2M6 14h12v7H6z"/></svg>
      Salvar PDF
    </button>
  </div>

  <div class="sheet">

    <!-- ============ HEADER ============ -->
    <header class="doc-head">
      <img src="${LOGO_DATA_URI}" alt="3v3">
      <div class="right">
        <div class="kicker">Laudo Técnico de Dispositivos</div>
        <div class="id mono" id="report-id">${escapeHtml(relatorioId)}</div>
      </div>
    </header>

    <!-- ============ TITLE ============ -->
    <div class="title-row">
      <h1>Saúde de Baterias <span class="accent">&amp; Recarga</span></h1>
      <div></div>
    </div>
    <div class="sub">
      <span>Unidade <b id="m-cliente">${escapeHtml(cliente)}</b></span>
      <span class="sep">•</span>
      <span>Gerado em <b id="m-data">${escapeHtml(geradoEm)}</b></span>
      <span class="sep">•</span>
      <span>Janela de análise <b>${escapeHtml(periodo)}</b></span>
      <span class="sep">•</span>
      <span><b id="m-total">${report.items.length}</b> dispositivos monitorados</span>
    </div>

    <!-- ============ HEALTH HERO ============ -->
    <section>
      <div class="hero">
        <div class="gauge">
          <svg width="118" height="118" viewBox="0 0 36 36">
            <path stroke="var(--line2)" stroke-width="3.2" fill="none" d="M18 2.5a15.5 15.5 0 0 1 0 31 15.5 15.5 0 0 1 0-31"/>
            <path id="gauge-arc" stroke="var(--gold)" stroke-width="3.6" stroke-linecap="round" fill="none"
                  stroke-dasharray="0,100" d="M18 2.5a15.5 15.5 0 0 1 0 31 15.5 15.5 0 0 1 0-31"/>
          </svg>
          <div class="num"><b id="health-num">—</b><span>Índice</span></div>
        </div>
        <div class="meta">
          <h3>Saúde geral da Fazenda</h3>
          <div class="verdict" id="health-verdict">—</div>
          <p id="health-desc">Índice ponderado pela distribuição de todos os dispositivos: saudável, atenção e crítico.</p>
          <div class="stat-mini">
            <div><span>Índice por estado</span><b id="avg-perf">—</b></div>
            <div><span>Tensão mínima média</span><b class="mono" id="avg-minv">—</b></div>
            <div><span>Em risco imediato</span><b id="risk-count">—</b></div>
            <div><span>Baixa confiança</span><b id="lowconf-count">—</b></div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ KPIs ============ -->
    <section class="heat-section">
      <div class="kpis" id="kpis"></div>
    </section>

    <!-- ============ PARK HEATMAP ============ -->
    <section class="heatmap-section">
      <div class="sec-head">
        <div>
          <div class="eyebrow">Visão de campo</div>
          <h2>Mapa de calor da Fazenda</h2>
        </div>
        <div class="legend">
          <span><i style="background:var(--ok)"></i>Saudável</span>
          <span><i style="background:var(--warn)"></i>Atenção</span>
          <span><i style="background:var(--crit)"></i>Crítico</span>
        </div>
      </div>
      ${heatmapSplit}
    </section>

    <!-- ============ REGISTERED CHANGES ============ -->
    ${changesSection}

    <!-- ============ CHARTS ============ -->
    <section class="page-break">
      <div class="sec-head">
        <div>
          <div class="eyebrow">Diagnóstico</div>
          <h2>Composição e desempenho</h2>
        </div>
        <div class="note">Distribuição por estado operacional e rendimento por fonte de energia.</div>
      </div>
      <div class="cols c-12">
        <div class="panel">
          <h4>Composição por estado</h4>
          <h3>Distribuição da fazenda</h3>
          <div class="donut-wrap">
            <div class="donut">
              <svg width="128" height="128" viewBox="0 0 36 36" id="donut-svg"></svg>
              <div class="ctr"><b id="donut-total">—</b><span>Unidades</span></div>
            </div>
            <div class="dleg" id="donut-legend"></div>
          </div>
        </div>
        <div class="panel">
          <h4>Rendimento médio por tipo</h4>
          <h3>Solar × Fonte × Meta</h3>
          <div id="type-bars"></div>
        </div>
      </div>

      <div class="cols c-2" style="margin-top:16px;">
        <div class="panel">
          <h4>Causa provável</h4>
          <h3>Distribuição por diagnóstico</h3>
          <div id="cause-bars">${causeBars}</div>
        </div>
        <div class="panel">
          <h4>Prioridade de inspeção</h4>
          <h3>Piores índices de saúde</h3>
          <div class="rank" id="rank"></div>
        </div>
      </div>
    </section>

    <!-- ============ DEVICE INVENTORY ============ -->
    <section class="page-break">
      <div class="sec-head">
        <div>
          <div class="eyebrow">Registro técnico</div>
          <h2>Inventário de dispositivos</h2>
        </div>
        <div class="note" id="tbl-count-note"></div>
      </div>
      <div class="conf-note" id="conf-note" style="display:none">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>
        <span><b id="conf-count">—</b> dispositivos possuem dados insuficientes (confiança baixa); o diagnóstico deve ser usado como triagem, não como conclusão de vida útil.</span>
      </div>
      <div class="inventory-wrap">
        <div class="inventory-head no-print">
          <div class="filters">
            <input type="text" id="searchInput" oninput="applyFilters()" placeholder="Buscar endereço…">
            <select id="typeFilter" onchange="applyFilters()">
              <option value="ALL">Todos os tipos</option>
              <option value="SOLAR">Solar</option>
              <option value="FONTE">Fonte</option>
            </select>
            <select id="statusFilter" onchange="applyFilters()">
              <option value="ALL">Todos os estados</option>
              <option value="OK">Saudável</option>
              <option value="ATENCAO">Atenção</option>
              <option value="CRITICO">Crítico</option>
              <option value="SEM_DADOS">Sem dados no período</option>
            </select>
          </div>
        </div>
        ${inventorySplit}
      </div>
    </section>

    <!-- ============ FOOTER ============ -->
    <footer class="doc-foot">
      <span>3v3 — Inteligência de manutenção de dispositivos</span>
      <span id="foot-meta">Laudo confidencial · ${escapeHtml(cliente)}</span>
    </footer>

  </div>

  <!-- ===== device data injected by the PDF generator ===== -->
  <script type="application/json" id="device-data">${devicesJson}</script>

  <script>
  /* ---------------- dados reais injetados pelo gerador (ReportQueryResult) ---------------- */
  const CLIENTE  = ${toJsonForScript(cliente)};
  const GERADO   = ${toJsonForScript(geradoEm)};
  const REPORTID = ${toJsonForScript(relatorioId)};
  const OVERALL_HEALTH = ${toJsonForScript(overallHealth)};

  let DEVICES;
  try{
    DEVICES = JSON.parse(document.getElementById('device-data').textContent.trim());
    if(!Array.isArray(DEVICES)) DEVICES = [];
  }catch(e){ DEVICES = []; }

  /* ---------------- helpers ---------------- */
  const pct = n => (Math.round(n*10)/10).toFixed(1).replace('.',',')+'%';
  const volt = n => (Math.round(n*100)/100).toFixed(2).replace('.',',')+' V';
  const C = {OK:{c:'ok',label:'Saudável',col:'var(--ok)'},
             ATENCAO:{c:'warn',label:'Atenção',col:'var(--warn)'},
             CRITICO:{c:'crit',label:'Crítico',col:'var(--crit)'},
             SEM_DADOS:{c:'nodata',label:'Sem dados no período',col:'#6b7280'}};
  const DIAG = {NORMAL:'Normal',BATERIA_FRACA:'Bateria fraca',FALHA_CARGA:'Falha de carga',
                DESCARGA_EXCESSIVA:'Descarga excessiva',BAIXA_TENSAO_RECENTE:'Baixa tensão recente',
                DADOS_INSUFICIENTES:'Dados insuficientes'};
  // Color the health index by life-status bands (85 / 50).
  const perfColor = p => p<50?'var(--crit)':p<85?'var(--warn)':'var(--ok)';
  const deviceIdentity = d => 'DIR ' + d.addr + ' - ' + (d.primaryFunctionLabel || 'Dispositivo');
  const CAT = {AUTOMACAO:{c:'auto',s:'AUT'},SENSORIAMENTO:{c:'sense',s:'SEN'}};
  const catBadges = cats => (cats||[]).map(k=>CAT[k]?\`<span class="cat \${CAT[k].c}">\${CAT[k].s}</span>\`:'').join('');
  function order(d){ return {CRITICO:0,ATENCAO:1,OK:2,SEM_DADOS:3}[d.status]; }
  function diagLabel(d){ return DIAG[d] || d; }
  function spark(daily){
    if(!daily||!daily.length) return '<span class="motivo">—</span>';
    const recent=daily.slice(-14);
    const cls=s=>s>=85?'ok':s>=50?'warn':'crit';
    return '<div class="spark">'+recent.map(x=>\`<i class="\${cls(x.dayScore)}" style="height:\${Math.max(x.dayScore,6)}%"></i>\`).join('')+'</div>';
  }

  /* ---------------- aggregates ---------------- */
  const total = DEVICES.length;
  const analyzable = DEVICES.filter(d=>d.hasDataInPeriod);
  const share = n => analyzable.length ? n/analyzable.length*100 : 0;
  const byStatus = s => DEVICES.filter(d=>d.status===s);
  const nOK=byStatus('OK').length, nWarn=byStatus('ATENCAO').length,
        nCrit=byStatus('CRITICO').length;
  const avgMinV = analyzable.length ? analyzable.reduce((a,d)=>a+d.minV,0)/analyzable.length : 0;
  const lowConf = analyzable.filter(d=>d.confidence==='BAIXA');
  // Saúde geral = composição de todos os dispositivos por estado:
  // OK=100, ATENCAO=50, CRITICO=0. Não depende da média dos logs analisados.
  const avgPerf = OVERALL_HEALTH;
  const health = Math.round(OVERALL_HEALTH);

  /* ---------------- fill meta ---------------- */
  document.getElementById('m-cliente').textContent = CLIENTE;
  document.getElementById('m-data').textContent = GERADO;
  document.getElementById('m-total').textContent = total;
  document.getElementById('report-id').textContent = REPORTID;
  document.getElementById('foot-meta').textContent = 'Laudo confidencial · ' + CLIENTE;
  document.title = 'Laudo de Saúde de Baterias — ' + CLIENTE;

  /* ---------------- gauge ---------------- */
  document.getElementById('gauge-arc').setAttribute('stroke-dasharray', health+',100');
  document.getElementById('gauge-arc').setAttribute('stroke', health >= 85 ? 'var(--ok)' : health >= 50 ? 'var(--gold)' : 'var(--crit)');
  document.getElementById('health-num').textContent = health+'%';
  document.getElementById('avg-perf').textContent = pct(avgPerf);
  document.getElementById('avg-minv').textContent = volt(avgMinV);
  document.getElementById('risk-count').textContent = nCrit + ' un.';
  document.getElementById('lowconf-count').textContent = lowConf.length + ' un.';
  const verdict = health>=85?'Operação saudável':health>=50?'Requer atenção':'Ação corretiva urgente';
  document.getElementById('health-verdict').textContent = verdict;

  /* ---------------- KPI cards ---------------- */
  const kpiData=[
    {c:'ok',tag:'Saudável',n:nOK,desc:'Tensão estável e recarga contínua'},
    {c:'warn',tag:'Atenção',n:nWarn,desc:'Flutuações ou recarga parcial recorrente'},
    {c:'crit',tag:'Ação corretiva',n:nCrit,desc:'Sub-tensão com alto risco de dano'},
  ];
  document.getElementById('kpis').innerHTML = kpiData.map(k=>\`
    <div class="kpi \${k.c}">
      <span class="tag"><span class="dot"></span>\${k.tag}</span>
      <div class="big">\${k.n} <small>un. · \${Math.round(share(k.n))}%</small></div>
      <div class="desc">\${k.desc}</div>
      <div class="bar"><i style="width:\${share(k.n)}%"></i></div>
    </div>\`).join('');

  /* ---------------- donut ---------------- */
  (function(){
    const segs=[{n:nOK,col:'var(--ok)',lab:'Saudável'},
                {n:nWarn,col:'var(--warn)',lab:'Atenção'},
                {n:nCrit,col:'var(--crit)',lab:'Crítico'}];
    let off=0; const svg=document.getElementById('donut-svg'); let paths='';
    segs.forEach(s=>{
      const len=share(s.n);
      paths+=\`<circle r="15.5" cx="18" cy="18" fill="none" stroke="\${s.col}" stroke-width="4"
        stroke-dasharray="\${len} \${100-len}" stroke-dashoffset="\${-off}"/>\`;
      off+=len;
    });
    svg.innerHTML=paths;
    document.getElementById('donut-total').textContent=total;
    document.getElementById('donut-legend').innerHTML=segs.map(s=>\`
      <div class="row"><i style="background:\${s.col}"></i>
        <span class="lab">\${s.lab}</span><b>\${s.n}</b>
        <span class="pc">\${Math.round(share(s.n))}%</span></div>\`).join('');
  })();

  /* ---------------- type bars ---------------- */
  (function(){
    const solar=analyzable.filter(d=>d.tipo==='SOLAR'), fonte=analyzable.filter(d=>d.tipo==='FONTE');
    const avg=a=>a.length?a.reduce((s,d)=>s+d.perf,0)/a.length:0;
    const rows=[
      {l:'Média Solar',v:avg(solar),col:'var(--gold)'},
      {l:'Média Fontes',v:avg(fonte),col:'var(--gold-deep)'},
      {l:'Meta de desempenho',v:90,col:'var(--faint)'},
    ];
    document.getElementById('type-bars').innerHTML=rows.map(r=>\`
      <div class="hbar">
        <div class="top"><span class="l">\${r.l}</span><span class="v mono">\${pct(r.v)}</span></div>
        <div class="track"><i style="width:\${r.v}%;background:\${r.col}"></i></div>
      </div>\`).join('');
  })();

  /* ---------------- rank (worst) ---------------- */
  (function(){
    const worst=[...analyzable].sort((a,b)=>a.perf-b.perf).slice(0,6);
    document.getElementById('rank').innerHTML=worst.map((d,i)=>\`
      <div class="row">
        <span class="pos mono">\${String(i+1).padStart(2,'0')}</span>
        <span class="name mono">\${deviceIdentity(d)}</span>
        <span class="diag" title="\${diagLabel(d.diagnosis)}">\${diagLabel(d.diagnosis)}</span>
        <div class="track"><i style="width:\${d.perf}%;background:\${perfColor(d.perf)}"></i></div>
        <span class="val mono">\${pct(d.perf)}</span>
      </div>\`).join('');
  })();

  /* ---------------- device inventory ---------------- */
  function cardHTML(d){
    const metrics=d.hasDataInPeriod
      ? \`<div class="imc-metrics">
          <span><b class="mono">\${pct(d.perf)}</b><small>saude</small></span>
          <span><b class="mono">\${volt(d.minV)}</b><small>min.</small></span>
          <span class="forecast-metric"><small>previsão</small>\${spark(d.daily)}</span>
          <span><b style="color:\${perfColor(d.perf)}">\${diagLabel(d.diagnosis)}</b><small>diagnostico</small></span>
        </div>\`
      : \`<div class="imc-metrics no-data-metric">
          <span><b>FALTA DE DADOS</b><small>no período selecionado</small></span>
        </div>\`;
    return \`<article class="inventory-mini-card \${C[d.status].c}">
      <div class="imc-main">
        <div>
          <span class="dev-id">\${deviceIdentity(d)}</span>
          <span class="dev-cats">\${catBadges(d.categories)}</span>
        </div>
        <span class="badge \${C[d.status].c}"><i></i>\${C[d.status].label}</span>
      </div>
      \${metrics}
      <p class="motivo">\${d.motivo}</p>
    </article>\`;
  }
  function render(list){
    const auto = list.filter(d=>d.classification==='AUTOMACAO');
    const sensor = list.filter(d=>d.classification==='SENSORIAMENTO');
    const autoGrid=document.getElementById('inventory-automation');
    const sensorGrid=document.getElementById('inventory-sensors');
    autoGrid.innerHTML = auto.length ? auto.map(cardHTML).join('')
      : '<div class="inventory-empty">Nenhum dispositivo nesta categoria.</div>';
    sensorGrid.innerHTML = sensor.length ? sensor.map(cardHTML).join('')
      : '<div class="inventory-empty">Nenhum dispositivo nesta categoria.</div>';
    document.getElementById('tbl-count-note').textContent = list.length+' de '+total+' dispositivos';
  }
  function applyFilters(){
    const q=document.getElementById('searchInput').value.toLowerCase();
    const t=document.getElementById('typeFilter').value;
    const s=document.getElementById('statusFilter').value;
    render(DEVICES.filter(d=>
      (deviceIdentity(d).toLowerCase().includes(q)||d.addr.includes(q)) &&
      (t==='ALL'||d.tipo===t) && (s==='ALL'||d.status===s))
      .sort((a,b)=>order(a)-order(b)||a.perf-b.perf));
  }
  render([...DEVICES].sort((a,b)=>order(a)-order(b)||a.perf-b.perf));

  /* ---------------- confidence banner ---------------- */
  (function(){
    if(!lowConf.length) return;
    document.getElementById('conf-count').textContent = lowConf.length;
    document.getElementById('conf-note').style.display = 'flex';
  })();
  </script>
</body>
</html>
`;
}
