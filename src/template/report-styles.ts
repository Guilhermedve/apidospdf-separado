export const REPORT_STYLES = `
:root{--ink:#17212b;--muted:#667085;--line:#dfe3e8;--paper:#fff;--soft:#f7f8fa;--gold:#b78a32;--gold-soft:#f8f0df;--ok:#20845a;--ok-soft:#e8f5ef;--warn:#c47a13;--warn-soft:#fff3dd;--crit:#b42318;--crit-soft:#fdecea;--radius:12px}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--paper);color:var(--ink);font-family:Arial,sans-serif;font-size:12px}
body{padding:18px}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:3px solid var(--gold);padding-bottom:14px;margin-bottom:16px}
h1{font-size:24px;line-height:1.1;margin:0 0 7px}h2{font-size:16px;margin:0}p{margin:0}
.meta{color:var(--muted);line-height:1.6;text-align:right}
.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:16px}
.summary-card{border:1px solid var(--line);border-radius:var(--radius);padding:12px;background:var(--soft)}
.summary-card small{display:block;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}.summary-card strong{font-size:21px}
.inventory-wrap{border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:#fff}
.inventory-head{padding:13px 15px;border-bottom:1px solid var(--line)}
.inventory-split{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:14px;background:#fbfaf7}
.inventory-panel{border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;background:linear-gradient(180deg,var(--gold-soft),#fff)}
.inventory-panel.sense{background:linear-gradient(180deg,var(--ok-soft),#fff)}
.inventory-panel-head{display:flex;justify-content:space-between;gap:10px;padding:11px 12px;border-bottom:1px solid var(--line);font-weight:700}
.inventory-card-grid{display:grid;gap:8px;padding:10px}
.inventory-mini-card{border:1px solid var(--line);border-left:4px solid var(--warn);border-radius:10px;background:#fff;padding:10px}
.inventory-mini-card.ok{border-left-color:var(--ok)}.inventory-mini-card.crit{border-left-color:var(--crit)}
.device-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.device-id{font-weight:800}.status{font-size:9px;font-weight:800;text-transform:uppercase}
.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}.metric{background:var(--soft);border-radius:7px;padding:7px}.metric small,.forecast-metric small{display:block;color:var(--muted);font-size:8px;text-transform:uppercase;margin-bottom:5px}.metric strong{font-size:12px}
.reason{margin-top:8px;padding-top:7px;border-top:1px solid var(--line);color:var(--muted);line-height:1.4}
.forecast-metric{margin-top:8px;background:var(--soft);border-radius:7px;padding:7px}.spark{display:flex;align-items:flex-end;height:28px;gap:3px}.spark i{display:block;flex:1;min-width:3px;border-radius:2px 2px 0 0;background:var(--warn)}.spark i.ok{background:var(--ok)}.spark i.bad,.spark i.crit{background:var(--crit)}
.inventory-empty{padding:24px;text-align:center;color:var(--muted)}
@page{size:A4 landscape;margin:10mm}
@media print{body{padding:0}.inventory-wrap{overflow:visible}.inventory-split{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0;background:transparent}.inventory-panel{break-inside:auto;page-break-inside:auto;margin-bottom:12px}.inventory-mini-card{break-inside:avoid;page-break-inside:avoid;margin-bottom:7px}}
`;
