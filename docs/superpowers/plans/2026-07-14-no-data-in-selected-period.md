# No Data in Selected Period Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect whether each DIR has valid battery samples inside the selected document window and render a neutral `FALTA DE DADOS NO PERÍODO SELECIONADO` state without treating missing data as 0% health.

**Architecture:** `BatteryReportMapper` owns temporal filtering because it receives both the device rows and the document window. It exposes explicit presence metadata through the report and view-model types; the compatibility adapter carries that metadata into the official PDF template, which only renders the resulting neutral state. Summary health excludes no-data devices from both status counts and the overall-health denominator.

**Tech Stack:** TypeScript 6, NestJS 11, Jest 30 with ts-jest, Zod datapool contract, Puppeteer 25.

## Global Constraints

- Preserve `src/pdf/report-html.ts` as the single visual source of truth.
- Use `windowStart` and `windowEnd` from the validated datapool document; do not use the machine clock.
- Count a row only when its timestamp is inside the inclusive window and `bat` is finite.
- Keep every DIR visible even when it has no valid samples in the period.
- Render missing data as a neutral state, never as `0%`, healthy, attention, or critical.
- Do not display stale minimum voltage, forecast, or diagnosis metrics on a no-data card.
- Exclude no-data devices from status totals and from the overall-health denominator.
- Do not change endpoints, queues, storage, retention, or unrelated PDF layout.
- This checkout is not currently recognized as a Git repository. Run the commit steps only after its Git metadata is restored; otherwise record the intended commit boundary and continue without fabricating a commit.

---

## File Structure

- `src/battery/battery-report.types.ts`: internal presence metadata returned by the mapper.
- `src/battery/battery-report.mapper.ts`: inclusive window filtering and valid-sample count.
- `src/template/report-view-model.types.ts`: neutral dashboard status and card metadata.
- `src/template/report-view-model.builder.ts`: neutral status, summary counts, sorting, and overall-health exclusion.
- `src/template/legacy-report.types.ts`: compatibility fields consumed by the official legacy visual model.
- `src/template/legacy-report.adapter.ts`: carries presence metadata without recalculating it.
- `src/pdf/report-html.ts`: neutral CSS and copy for heatmap and inventory cards.
- `test/unit/battery/battery-report.mapper.spec.ts`: temporal-boundary behavior.
- `test/unit/template/report-view-model.builder.spec.ts`: summary and neutral-status behavior.
- `test/unit/template/report-html.renderer.spec.ts`: rendered HTML regression coverage.
- `test/integration/template/report-document.service.spec.ts`: end-to-end document-to-HTML contract.

### Task 1: Detect valid samples inside the document window

**Files:**
- Modify: `src/battery/battery-report.types.ts`
- Modify: `src/battery/battery-report.mapper.ts`
- Test: `test/unit/battery/battery-report.mapper.spec.ts`

**Interfaces:**
- Consumes: `DatapoolPeriodDocument.windowStart`, `DatapoolPeriodDocument.windowEnd`, and `DatapoolDevice.raw`.
- Produces: `BatteryReportDevice.hasDataInPeriod: boolean` and `BatteryReportDevice.samplesInPeriod: number`.

- [ ] **Step 1: Write failing tests for old, boundary, and invalid rows**

Add tests that build a document with a fixed window and assert inclusive boundaries:

```ts
it('conta somente baterias validas dentro da janela inclusiva', () => {
  const device = makeDevice({
    raw: [
      rawRow('2026-07-07T12:59:59.999Z', 12.4),
      rawRow('2026-07-07T13:00:00.000Z', 12.5),
      rawRow('2026-07-10T13:00:00.000Z', 12.6),
      rawRow('2026-07-10T13:00:00.001Z', 12.7),
      rawRow('2026-07-09T13:00:00.000Z', Number.NaN),
    ],
  });
  const document = makeDocument(device, {
    windowStart: '2026-07-07T13:00:00.000Z',
    windowEnd: '2026-07-10T13:00:00.000Z',
  });

  const mapped = mapper.map(document, [device]).devices[0];

  expect(mapped.samplesInPeriod).toBe(2);
  expect(mapped.hasDataInPeriod).toBe(true);
});

it('marca sem dados quando so existem registros antigos', () => {
  const device = makeDevice({
    raw: [rawRow('2025-01-01T00:00:00.000Z', 12.8)],
  });
  const document = makeDocument(device, {
    windowStart: '2026-07-07T13:00:00.000Z',
    windowEnd: '2026-07-10T13:00:00.000Z',
  });

  const mapped = mapper.map(document, [device]).devices[0];

  expect(mapped.samplesInPeriod).toBe(0);
  expect(mapped.hasDataInPeriod).toBe(false);
});
```

Add `rawRow(time, bat)` to `test/unit/battery/battery-analysis.helpers.ts` only if the existing helper cannot express these rows; it must return a complete `BatteryRawRow` fixture.

- [ ] **Step 2: Run the focused mapper tests and verify RED**

Run:

```powershell
npm.cmd test -- test/unit/battery/battery-report.mapper.spec.ts --runInBand
```

Expected: FAIL because `samplesInPeriod` and `hasDataInPeriod` do not exist.

- [ ] **Step 3: Add the report-device presence contract**

Add to `BatteryReportDevice`:

```ts
hasDataInPeriod: boolean;
samplesInPeriod: number;
```

- [ ] **Step 4: Implement inclusive valid-row filtering in the mapper**

In `mapDevice`, calculate presence before building `base`:

```ts
const windowStartMs = Date.parse(windowStart);
const windowEndMs = Date.parse(windowEnd);
const rowsInPeriod = device.raw.filter((row) => {
  const timeMs = Date.parse(row.time);
  return (
    Number.isFinite(timeMs) &&
    timeMs >= windowStartMs &&
    timeMs <= windowEndMs &&
    Number.isFinite(row.bat)
  );
});
```

Change `mapDevice` to receive both boundaries:

```ts
private mapDevice(
  device: DatapoolDevice,
  period: ReportPeriod,
  windowStart: string,
  windowEnd: string,
): BatteryReportDevice
```

Pass `document.windowStart` and `document.windowEnd` from `map`, then add to `base`:

```ts
hasDataInPeriod: rowsInPeriod.length > 0,
samplesInPeriod: rowsInPeriod.length,
raw: structuredClone(rowsInPeriod).sort(
  (left, right) => Date.parse(left.time) - Date.parse(right.time),
),
```

Run local analysis against `base.raw`, so records outside the selected period cannot affect health.

- [ ] **Step 5: Run mapper tests and verify GREEN**

Run the focused command from Step 2.

Expected: PASS with the existing immutability and fallback tests still green.

- [ ] **Step 6: Commit the mapper boundary if Git is available**

```powershell
git add src/battery/battery-report.types.ts src/battery/battery-report.mapper.ts test/unit/battery/battery-report.mapper.spec.ts test/unit/battery/battery-analysis.helpers.ts
git commit -m "feat: detect battery data in report window"
```

### Task 2: Propagate the neutral state and fix report summaries

**Files:**
- Modify: `src/template/report-view-model.types.ts`
- Modify: `src/template/report-view-model.builder.ts`
- Modify: `src/template/legacy-report.types.ts`
- Modify: `src/template/legacy-report.adapter.ts`
- Test: `test/unit/template/report-view-model.builder.spec.ts`

**Interfaces:**
- Consumes: `BatteryReportDevice.hasDataInPeriod` and `samplesInPeriod` from Task 1.
- Produces: `DashboardStatus = 'OK' | 'ATENCAO' | 'CRITICO' | 'SEM_DADOS'`, `DeviceCardViewModel.hasDataInPeriod`, and compatibility `BatteryReportItem.hasDataInPeriod`.

- [ ] **Step 1: Write failing builder tests for the neutral state and denominator**

```ts
it('marca DIR sem amostras do periodo e o exclui da saude geral', () => {
  const data = singleDeviceReport();
  const withData = structuredClone(data.devices[0]);
  withData.addr = '001';
  withData.hasDataInPeriod = true;
  withData.samplesInPeriod = 3;
  withData.health.lifeStatus = 'OK';
  withData.health.confidence = 'ALTA';
  const withoutData = structuredClone(withData);
  withoutData.addr = '002';
  withoutData.hasDataInPeriod = false;
  withoutData.samplesInPeriod = 0;
  withoutData.health.healthScore = 0;
  data.devices = [withData, withoutData];

  const view = builder.build(data);
  const missing = view.sensingDevices.find((device) => device.addr === '002');

  expect(missing).toMatchObject({
    status: 'SEM_DADOS',
    hasDataInPeriod: false,
    samplesInPeriod: 0,
    reason: 'FALTA DE DADOS NO PERÍODO SELECIONADO',
  });
  expect(view.summary).toMatchObject({
    healthyDevices: 1,
    attentionDevices: 0,
    criticalDevices: 0,
    noDataDevices: 1,
    overallHealth: 100,
  });
});
```

- [ ] **Step 2: Run the builder test and verify RED**

```powershell
npm.cmd test -- test/unit/template/report-view-model.builder.spec.ts --runInBand
```

Expected: FAIL because `SEM_DADOS`, `noDataDevices`, and presence fields are absent.

- [ ] **Step 3: Extend view-model and compatibility types**

Use these exact contracts:

```ts
export type DashboardStatus = 'OK' | 'ATENCAO' | 'CRITICO' | 'SEM_DADOS';

export interface DeviceCardViewModel {
  // existing fields stay unchanged
  hasDataInPeriod: boolean;
  samplesInPeriod: number;
}

export interface ReportSummaryViewModel {
  // existing fields stay unchanged
  noDataDevices: number;
}
```

Add to `src/template/legacy-report.types.ts`:

```ts
hasDataInPeriod: boolean;
samplesInPeriod: number;
```

- [ ] **Step 4: Build neutral devices and calculate summaries from analyzable devices only**

In `mapDevice`, assign:

```ts
const hasDataInPeriod = device.hasDataInPeriod;
return {
  // existing mapping
  hasDataInPeriod,
  samplesInPeriod: device.samplesInPeriod,
  status: hasDataInPeriod ? this.status(device) : 'SEM_DADOS',
  reason: hasDataInPeriod
    ? this.reason(device)
    : 'FALTA DE DADOS NO PERÍODO SELECIONADO',
};
```

Build summaries with:

```ts
const analyzableDevices = devices.filter((device) => device.hasDataInPeriod);
```

Use `analyzableDevices` for healthy/attention/critical counts and
`calculateOverallHealth`. Set:

```ts
noDataDevices: devices.length - analyzableDevices.length,
```

Add `SEM_DADOS: 3` to `statusOrder` so missing-data cards appear after devices with actionable health.

- [ ] **Step 5: Carry presence through the legacy adapter**

In `adaptDevice`, add:

```ts
hasDataInPeriod: device.hasDataInPeriod,
samplesInPeriod: device.samplesInPeriod,
```

Do not infer presence from `performance`, `daily`, or `minimumVoltage`.

- [ ] **Step 6: Run builder and adapter-adjacent tests**

```powershell
npm.cmd test -- test/unit/template/report-view-model.builder.spec.ts test/unit/template/report-html.renderer.spec.ts --runInBand
```

Expected: builder tests PASS; renderer fixtures may fail until Task 3 because their manually built view models need the new fields.

- [ ] **Step 7: Commit the presentation contract if Git is available**

```powershell
git add src/template/report-view-model.types.ts src/template/report-view-model.builder.ts src/template/legacy-report.types.ts src/template/legacy-report.adapter.ts test/unit/template/report-view-model.builder.spec.ts
git commit -m "feat: model devices without period data"
```

### Task 3: Render missing data without a false 0% health value

**Files:**
- Modify: `src/pdf/report-html.ts`
- Modify: `test/unit/template/report-html.renderer.spec.ts`
- Modify: `test/integration/template/report-document.service.spec.ts`

**Interfaces:**
- Consumes: compatibility `BatteryReportItem.hasDataInPeriod` and `samplesInPeriod` from Task 2.
- Produces: neutral heatmap/inventory markup with class `nodata` and visible copy `FALTA DE DADOS NO PERÍODO SELECIONADO`.

- [ ] **Step 1: Update renderer fixtures and write a failing neutral-card test**

Add `hasDataInPeriod: true` and `samplesInPeriod: 2` to the normal device in `viewModel()`. Add an override or a dedicated view model with no data, then assert:

```ts
it('mostra falta de dados sem imprimir zero por cento como saude', () => {
  const view = viewModel();
  const missing = view.sensingDevices[0];
  missing.hasDataInPeriod = false;
  missing.samplesInPeriod = 0;
  missing.status = 'SEM_DADOS';
  missing.performance = 0;
  missing.reason = 'FALTA DE DADOS NO PERÍODO SELECIONADO';

  const html = renderer.render(view);

  expect(html).toContain('class="cell nodata"');
  expect(html).toContain('FALTA DE DADOS NO PERÍODO SELECIONADO');
  expect(html).not.toMatch(/DIR 045[\s\S]{0,500}>0<span style="font-size:9px">%/);
});
```

- [ ] **Step 2: Run the renderer test and verify RED**

```powershell
npm.cmd test -- test/unit/template/report-html.renderer.spec.ts --runInBand
```

Expected: FAIL because the template still renders `0%` and has no neutral status.

- [ ] **Step 3: Extend the official template dashboard contract**

In `src/pdf/report-html.ts`, use:

```ts
type DashboardStatus = 'OK' | 'ATENCAO' | 'CRITICO' | 'SEM_DADOS';
```

Add to `DashboardDevice`:

```ts
hasDataInPeriod: boolean;
samplesInPeriod: number;
```

Add the neutral view:

```ts
SEM_DADOS: { className: 'nodata', label: 'Sem dados no período' },
```

Update the `STATUS_VIEW` class-name union to include `'nodata'` and map the two presence fields in `toDashboardDevice`.

- [ ] **Step 4: Render neutral heatmap and inventory content**

In `renderHeatmapCell`, replace the performance fragment with:

```ts
const performance = device.hasDataInPeriod
  ? `${Math.round(device.perf)}<span style="font-size:9px">%</span>`
  : '<span class="no-data-label">FALTA DE DADOS<br>NO PERÍODO</span>';
```

Render `${performance}` inside `.perf`. In `renderInventoryMiniCard`, branch the
complete metrics area so values from old rows cannot look current:

```ts
const metrics = device.hasDataInPeriod
  ? `<div class="imc-metrics">
       <span><b class="mono">${device.perf.toFixed(1)}%</b><small>saúde</small></span>
       <span><b class="mono">${device.minV.toFixed(2)} V</b><small>min.</small></span>
       <span class="forecast-metric"><small>previsão</small>${sparkline(device.daily)}</span>
       <span><b style="color:${diagnosisView.color}">${escapeHtml(diagnosisView.label)}</b><small>diagnóstico</small></span>
     </div>`
  : `<div class="imc-metrics no-data-metric">
       <span><b>FALTA DE DADOS</b><small>no período selecionado</small></span>
     </div>`;
```

Use `${metrics}` and keep address, classification, primary function, power type,
and reason visible.

- [ ] **Step 5: Add neutral print styling**

Add CSS next to existing `.ok`, `.warn`, and `.crit` rules:

```css
.cell.nodata,.inventory-mini-card.nodata{
  background:#f3f4f6;
  border-color:#9ca3af;
  color:#4b5563;
}
.cell.nodata .pin{background:#6b7280}
.no-data-label{font-size:8px;line-height:1.15;font-weight:800;color:#4b5563}
.no-data-metric{grid-column:span 2}
.no-data-metric b{font-size:10px;color:#4b5563}
```

Do not reuse attention yellow or critical red.

- [ ] **Step 6: Add an integration assertion for old records outside the window**

In `report-document.service.spec.ts`, clone the fixture, replace one selected device's `raw` with a row older than `windowStart`, render it, and assert the HTML contains the DIR plus the no-data copy and does not contain its `0%` health fragment.

- [ ] **Step 7: Run renderer and document tests and verify GREEN**

```powershell
npm.cmd test -- test/unit/template/report-html.renderer.spec.ts test/integration/template/report-document.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit the visual state if Git is available**

```powershell
git add src/pdf/report-html.ts test/unit/template/report-html.renderer.spec.ts test/integration/template/report-document.service.spec.ts
git commit -m "feat: render missing period data in battery PDF"
```

### Task 4: Regression verification and real PDF proof

**Files:**
- Verify: `src/battery/**`
- Verify: `src/template/**`
- Verify: `src/pdf/**`
- Produce: `macacos-af-3h-sem-dados.pdf`

**Interfaces:**
- Consumes: completed mapping, view-model, adapter, and template changes from Tasks 1-3.
- Produces: verified test/build results and a valid PDF artifact for visual inspection.

- [ ] **Step 1: Run focused regression tests**

```powershell
npm.cmd test -- test/unit/battery/battery-report.mapper.spec.ts test/unit/template/report-view-model.builder.spec.ts test/unit/template/report-html.renderer.spec.ts test/integration/template/report-document.service.spec.ts --runInBand
```

Expected: all selected suites PASS with no snapshots or expected values weakened merely to accept the change.

- [ ] **Step 2: Run the full test suite**

```powershell
npm.cmd test -- --runInBand
```

Expected: all suites PASS.

- [ ] **Step 3: Compile TypeScript without output**

```powershell
.\node_modules\.bin\tsc.cmd --noEmit --incremental false
```

Expected: exit code 0 and no diagnostics.

- [ ] **Step 4: Fetch a fresh Macacos snapshot and render the proof PDF through the completed datapool pipeline**

Use `GET /diagnostics/farms/macacos-af/periods/3h`, parse it with `parseDatapoolPeriodDocument`, render with `ReportDocumentService`, and generate through `PdfService`. Do not use the old database-backed API on port 3000 as proof of the new datapool pipeline.

Expected artifact: `macacos-af-3h-sem-dados.pdf`.

- [ ] **Step 5: Verify the PDF artifact concretely**

```powershell
$file = Get-Item 'macacos-af-3h-sem-dados.pdf'
$bytes = [IO.File]::ReadAllBytes($file.FullName)
$signature = [Text.Encoding]::ASCII.GetString($bytes[0..4])
if ($signature -ne '%PDF-' -or $file.Length -lt 10000) { throw 'PDF inválido' }
```

Expected: signature `%PDF-` and size greater than 10,000 bytes. Visually confirm that missing-data cards are gray, retain their DIR identity, show the exact warning, and never show `0%` as health.

- [ ] **Step 6: Record the final verification boundary**

If Git is available:

```powershell
git status --short
git log -3 --oneline
```

Otherwise, report the exact modified files, test commands, test counts, TypeScript result, PDF signature, and PDF size without claiming a commit.
