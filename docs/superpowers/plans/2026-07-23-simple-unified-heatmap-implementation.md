# Simple Unified Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o relatório `simple` usar o template legado completo com um único painel de mapa de calor para todos os dispositivos.

**Architecture:** O template legado continuará sendo a única fonte visual e receberá uma opção `heatmapMode`. O pipeline construirá o mesmo `ReportViewModel` para ambas as variantes; apenas o renderer escolherá `unified` para `simple` e o padrão `split` para `detailed`.

**Tech Stack:** TypeScript 6, NestJS 11, Jest 30, HTML/CSS autocontido e Puppeteer.

## Global Constraints

- O relatório `detailed` deve permanecer visualmente inalterado.
- O relatório `simple` deve diferir somente pelo mapa de calor unificado.
- O inventário continuará separado em Automação e Sensoriamento.
- Nenhum contrato de entrada, cálculo ou fallback será alterado.
- A implementação será feita na branch atual, sem criar nova branch.

---

### Task 1: Compartilhar o template legado com modos de mapa de calor

**Files:**
- Modify: `src/pdf/report-html.ts:320-550`
- Modify: `src/template/report-html.renderer.ts`
- Modify: `src/template/report-document.service.ts`
- Modify: `src/template/template.module.ts`
- Modify: `test/unit/template/report-html.renderer.spec.ts`
- Modify: `test/integration/template/report-document.service.spec.ts`
- Test: `test/integration/pdf/report-variants.pdf.spec.ts`

**Interfaces:**
- Consumes: `ReportViewModel`, `ReportType` e `ReportQueryResult` existentes.
- Produces: `renderReportHtml(report, { heatmapMode })`, onde `heatmapMode` aceita `'split' | 'unified'`; `ReportHtmlRenderer.renderSimple(viewModel)` usa `unified`; `ReportHtmlRenderer.render(viewModel)` mantém `split`.

- [ ] **Step 1: Escrever testes de regressão que expressem a única diferença**

Em `test/integration/template/report-document.service.spec.ts`, substituir os testes iniciais por:

```ts
it('usa o modelo antigo com mapa unificado na variante simples', () => {
  const html = createService().render(document, undefined, 'simple');

  expect(html).toContain('class="hero"');
  expect(html).toContain('data-testid="heatmap-devices"');
  expect(html).toContain('>Dispositivos</span>');
  expect(html).not.toContain('data-testid="heatmap-automation"');
  expect(html).not.toContain('data-testid="heatmap-sensors"');
  expect(html).toContain('id="inventory-automation"');
  expect(html).toContain('id="inventory-sensors"');
});

it('mantem o mapa separado na variante detalhada', () => {
  const html = createService().render(document, undefined, 'detailed');

  expect(html).toContain('data-testid="heatmap-automation"');
  expect(html).toContain('data-testid="heatmap-sensors"');
  expect(html).not.toContain('data-testid="heatmap-devices"');
});
```

Em `test/unit/template/report-html.renderer.spec.ts`, adicionar um teste que chama `renderSimple(viewModel())` e confirma `heatmap-devices`, além da presença das seções `hero`, `cause-bars`, `rank` e `device-data`.

- [ ] **Step 2: Executar os testes e confirmar a falha esperada**

Run:

```powershell
npm.cmd run test:integration -- --runInBand test/integration/template/report-document.service.spec.ts
```

Expected: FAIL porque o `simple` ainda usa o template executivo e não contém `heatmap-devices`.

- [ ] **Step 3: Parametrizar somente a renderização do mapa de calor**

Em `src/pdf/report-html.ts`, adicionar:

```ts
export type HeatmapMode = 'split' | 'unified';

export type ReportHtmlOptions = {
  heatmapMode?: HeatmapMode;
};
```

Alterar `renderHeatmapArea` para aceitar `'auto' | 'sense' | 'all'`, usar
`heatmap-devices` no modo `all` e manter o nome do sensor apenas nas células
classificadas como Sensoriamento.

Alterar a assinatura pública para:

```ts
export function renderReportHtml(
  report: ReportQueryResult,
  options: ReportHtmlOptions = {},
): string
```

Construir o mapa assim:

```ts
const heatmap =
  options.heatmapMode === 'unified'
    ? `<div class="heat-unified">
        ${renderHeatmapArea('Dispositivos', sortDashboardDevices(devices), 'all')}
      </div>`
    : `<div class="heat-split">
        ${renderHeatmapArea('Automação', automationDevices, 'auto')}
        ${renderHeatmapArea('Sensores', sensorDevices, 'sense')}
      </div>`;
```

Substituir a interpolação existente de `heatmapSplit` por `heatmap`.

- [ ] **Step 4: Direcionar as variantes ao mesmo modelo**

Em `src/template/report-html.renderer.ts`:

```ts
renderSimple(viewModel: ReportViewModel): string {
  return renderReportHtml(adaptViewModelToLegacyReport(viewModel), {
    heatmapMode: 'unified',
  });
}
```

Manter `render(viewModel)` sem opções para preservar o modo dividido.

Em `ReportDocumentService`, construir `viewModel` uma vez e escolher:

```ts
const viewModel = this.viewModelBuilder.build(reportData);
return reportType === 'simple'
  ? this.htmlRenderer.renderSimple(viewModel)
  : this.htmlRenderer.render(viewModel);
```

Remover `ReportDataBuilder` do construtor e do `TemplateModule`, porque deixa de
participar do pipeline de documentos. Ajustar os construtores nos testes.

- [ ] **Step 5: Executar testes direcionados**

Run:

```powershell
npm.cmd test -- --runInBand test/unit/template/report-html.renderer.spec.ts
npm.cmd run test:integration -- --runInBand test/integration/template/report-document.service.spec.ts
```

Expected: ambas as suítes passam.

- [ ] **Step 6: Validar compilação e geração de PDF**

Run:

```powershell
npm.cmd run build
npm.cmd run test:integration -- --runInBand
```

Expected: build com exit code 0 e 15 testes de integração aprovados, incluindo os dois PDFs.

- [ ] **Step 7: Commitar a implementação**

```powershell
git add -- src/pdf/report-html.ts src/template/report-html.renderer.ts src/template/report-document.service.ts src/template/template.module.ts test/unit/template/report-html.renderer.spec.ts test/integration/template/report-document.service.spec.ts test/integration/pdf/report-variants.pdf.spec.ts docs/superpowers/plans/2026-07-23-simple-unified-heatmap-implementation.md
git commit -m "feat: unify simple report heatmap"
```
