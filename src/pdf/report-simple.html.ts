import type { SimpleReportData } from '../template/report-data.types';
import {
  BASE_REPORT_CSS,
  escapeHtml,
  renderConclusion,
  renderExecutiveSummary,
  renderFooter,
  renderHeader,
} from './report-html.shared';

const SIMPLE_REPORT_CSS = `
.report-simple .status-headline strong{font-size:24px}
`;

export function renderSimpleReportHtml(data: SimpleReportData): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relatório executivo de baterias — ${escapeHtml(data.header.unitName)}</title>
    <style>${BASE_REPORT_CSS}${SIMPLE_REPORT_CSS}</style>
  </head>
  <body>
    <main class="sheet report-simple">
      ${renderHeader(data.header)}
      ${renderExecutiveSummary(data)}
      ${renderConclusion(data)}
      ${renderFooter(data.header)}
    </main>
  </body>
</html>`;
}
