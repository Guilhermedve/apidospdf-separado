# Actuator JSON to Excel Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a synchronous endpoint that reads one farm's actuator cache and downloads a validated, filterable XLSX containing only actuator rows.

**Architecture:** A dedicated client fetches and validates the actuator JSON, while an ExcelJS-backed translator writes the document to a Node writable stream. A thin Nest controller owns HTTP validation and download headers; the workbook service remains independent of Nest and HTTP.

**Tech Stack:** NestJS 11, TypeScript 6, Zod 4, ExcelJS 4, Jest 30, native fetch and Node streams.

## Global Constraints

- Public route: `GET /actuators/farms/:farm/excel`.
- Output filename: `<slug>-atuadores.xlsx`.
- Workbook contains exactly one worksheet named `Atuadores`.
- Worksheet columns are exactly `ÁREA`, `DATA/HORA`, `ADDR`, `FIR`, `PRODUTO`, `INJETADO (L)`, `PROGRAMADO (L)`, `NOTA`.
- Farm metadata must not appear inside the workbook.
- Source access is read-only; never call `POST /actuators/farms/:farm/run`.
- Reject more than 1,048,575 data rows instead of truncating or splitting.
- Preserve every source row, including failure notes; keep `ADDR` and parsed volumes numeric.
- Validate the full JSON before sending success headers.

---

### Task 1: Excel dependency and actuator document schema

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/actuator-excel/actuator-excel.types.ts`
- Create: `src/actuator-excel/actuator-cache.schema.ts`
- Create: `test/unit/actuator-excel/actuator-cache.schema.spec.ts`

**Interfaces:**
- Produces: `parseActuatorCacheDocument(input: unknown): ActuatorCacheDocument`.
- Produces: `ActuatorCacheDocument`, `ActuatorRow`, and `ActuatorTableMap` inferred from the Zod schema.

- [ ] **Step 1: Install ExcelJS**

Run: `npm.cmd install exceljs@^4.4.0`

Expected: `exceljs` appears under `dependencies`; lockfile is updated.

- [ ] **Step 2: Write failing schema tests**

Create tests around this fixture shape:

```ts
const valid = {
  farm: 'Central - AF',
  slug: 'central-af',
  generatedAt: '2026-07-13T12:00:00.000Z',
  windowStart: '2026-07-12T12:00:00.000Z',
  windowEnd: '2026-07-13T12:00:00.000Z',
  filter: { column: 'NOTE', contains: 'FIR' },
  summary: { totalTables: 2, tablesWithMatches: 1, totalRows: 2 },
  tables: {
    CX06_FLA25: [
      { TIME: '2026-07-13T10:00:00.000Z', ADDR: 25, NOTE: 'FIR ON' },
      { TIME: '2026-07-13T11:00:00.000Z', ADDR: 25, NOTE: 'FIR OFF' },
    ],
  },
};
```

Assert valid parsing, dynamic table keys, invalid timestamp rejection, non-integer `ADDR` rejection, absent `NOTE` rejection, and consistency between `summary.totalRows` and actual table rows.

- [ ] **Step 3: Run schema tests to verify RED**

Run: `npm.cmd test -- --runInBand test/unit/actuator-excel/actuator-cache.schema.spec.ts`

Expected: FAIL because the schema module does not exist.

- [ ] **Step 4: Implement the strict schema**

Use strict Zod objects and cross-field validation:

```ts
const rowSchema = z.object({
  TIME: z.string().datetime({ offset: true }),
  ADDR: z.number().int(),
  NOTE: z.string(),
}).strict();

const tablesSchema = z.record(z.string().min(1), z.array(rowSchema));
```

The document `superRefine` must check `summary.tablesWithMatches === Object.keys(tables).length` and `summary.totalRows === sum(table.length)` without requiring `summary.totalTables` to equal matched table count.

- [ ] **Step 5: Run schema tests to verify GREEN**

Run: `npm.cmd test -- --runInBand test/unit/actuator-excel/actuator-cache.schema.spec.ts`

Expected: PASS.

### Task 2: Read-only actuator cache client

**Files:**
- Create: `src/actuator-excel/actuator-cache.client.ts`
- Create: `src/actuator-excel/actuator-excel.errors.ts`
- Create: `test/unit/actuator-excel/actuator-cache.client.spec.ts`

**Interfaces:**
- Consumes: `AppConfigService`, `DatapoolFetch`, and `parseActuatorCacheDocument`.
- Produces: `ActuatorCacheClient.getFarm(slug: string, externalSignal?: AbortSignal): Promise<ActuatorCacheDocument>`.
- Produces: actuator-specific `ApplicationError` codes for missing cache, upstream failure, timeout, and invalid contract.

- [ ] **Step 1: Write failing client tests**

Cover the exact URL `https://datapool.example/actuators/farms/central-af`, GET method, JSON accept headers, optional Basic Auth, abort timeout, 404 mapping, transient HTTP mapping, network error mapping, and invalid JSON contract mapping. Capture the requested URL and assert it never contains `/run`.

- [ ] **Step 2: Run client tests to verify RED**

Run: `npm.cmd test -- --runInBand test/unit/actuator-excel/actuator-cache.client.spec.ts`

Expected: FAIL because `ActuatorCacheClient` does not exist.

- [ ] **Step 3: Implement the client**

Follow `DatapoolClient` conventions:

```ts
const url = `${config.datapoolBaseUrl}/actuators/farms/${encodeURIComponent(slug)}`;
const timeoutSignal = AbortSignal.timeout(config.datapoolTimeoutMs);
const signal = externalSignal
  ? AbortSignal.any([externalSignal, timeoutSignal])
  : timeoutSignal;
```

Parse JSON only after checking `response.ok`. Preserve `ApplicationError`; wrap unknown fetch failures as retryable actuator-unavailable errors.

- [ ] **Step 4: Run client and existing datapool tests**

Run: `npm.cmd test -- --runInBand test/unit/actuator-excel/actuator-cache.client.spec.ts test/unit/datapool/datapool.client.spec.ts`

Expected: PASS with no regression in the diagnostics client.

### Task 3: Actuator note parser and styled streaming translator

**Files:**
- Create: `src/actuator-excel/actuator-note.parser.ts`
- Create: `test/unit/actuator-excel/actuator-note.parser.spec.ts`
- Modify: `src/actuator-excel/actuator-workbook.service.ts`
- Modify: `test/unit/actuator-excel/actuator-workbook.service.spec.ts`

**Interfaces:**
- Consumes: validated `ActuatorCacheDocument` and Node `Writable`.
- Produces: `parseActuatorNote(note: string)` with cleaned note, FIR, product, injected and programmed volumes.
- Produces: `ActuatorWorkbookService.write(document: ActuatorCacheDocument, output: Writable): Promise<{ rows: number }>`.

- [ ] **Step 1: Write failing parser tests**

Assert `$'FIR233-AGUA' injetou 45 de 45 litros$` returns FIR `233`, product `FIR233-AGUA`, numeric volumes `45` and a cleaned note. Assert `$Falha na fertirrigação. (FIR:233)$` returns FIR `233`, a cleaned note and undefined product/volumes. Include comma decimals and an unrecognized note, which must retain its cleaned text without throwing.

- [ ] **Step 2: Run parser tests to verify RED**

Run: `npm.cmd test -- --runInBand test/unit/actuator-excel/actuator-note.parser.spec.ts`

Expected: FAIL because `actuator-note.parser.ts` does not exist.

- [ ] **Step 3: Implement the minimal parser**

Use anchored regular expressions for the observed injection and failure formats. Strip only the outer technical dollar markers and optional single quotes around the product. Convert comma decimal separators to dots and return undefined derived values for unrecognized notes.

- [ ] **Step 4: Run parser tests to verify GREEN**

Run: `npm.cmd test -- --runInBand test/unit/actuator-excel/actuator-note.parser.spec.ts`

Expected: PASS.

- [ ] **Step 5: Write failing workbook tests**

Generate into a `PassThrough`, collect chunks into a `Buffer`, reopen with `new ExcelJS.Workbook().xlsx.load(buffer)`, then assert:

```ts
expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Atuadores']);
expect(sheet.getRow(1).values).toEqual([
  undefined,
  'ÁREA',
  'DATA/HORA',
  'ADDR',
  'FIR',
  'PRODUTO',
  'INJETADO (L)',
  'PROGRAMADO (L)',
  'NOTA',
]);
```

Also assert natural area ordering, chronological ordering, parsed injection cells, retained failure rows with blank derived cells, numeric types, autofilter `A1:H1`, frozen first row, blue centered header, thin borders, and rejection above `MAX_EXCEL_DATA_ROWS`.

- [ ] **Step 6: Run workbook tests to verify RED**

Run: `npm.cmd test -- --runInBand test/unit/actuator-excel/actuator-workbook.service.spec.ts`

Expected: FAIL because the workbook still produces the old four-column layout.

- [ ] **Step 7: Implement styled streaming workbook output**

Create `new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useStyles: true, useSharedStrings: true })`, add exactly one sheet, configure columns and views, commit each row immediately, then commit worksheet and workbook. Use `Intl.Collator('pt-BR', { numeric: true })` for actuator names and timestamp comparison for rows.

Set the date format to `dd/mm/yyyy hh:mm:ss`, emit all eight approved columns, call `parseActuatorNote` for every row, keep failure rows, and write the cleaned note explicitly as text. Apply a dark-blue header with white bold centered text, filters, frozen header, column widths, and thin borders similar to the approved reference image.

- [ ] **Step 8: Run workbook tests to verify GREEN**

Run: `npm.cmd test -- --runInBand test/unit/actuator-excel/actuator-workbook.service.spec.ts`

Expected: PASS and generated workbook can be reopened.

### Task 4: Nest endpoint and module wiring

**Files:**
- Create: `src/actuator-excel/actuator-excel.controller.ts`
- Create: `src/actuator-excel/actuator-excel.module.ts`
- Modify: `src/app.module.ts`
- Modify: `src/common/errors/error-codes.ts`
- Create: `test/unit/actuator-excel/actuator-excel.controller.spec.ts`
- Create: `test/unit/actuator-excel/actuator-excel.module.spec.ts`

**Interfaces:**
- Consumes: `ActuatorCacheClient.getFarm` and `ActuatorWorkbookService.write`.
- Produces: `GET /actuators/farms/:farm/excel` with XLSX content headers and streamed response.

- [ ] **Step 1: Write failing controller and module tests**

Use fakes to assert that `central-af` is passed to the client, headers are set to:

```ts
response.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
response.attachment('central-af-atuadores.xlsx');
```

Assert invalid slugs are rejected before any upstream request and that the module resolves controller, client, and translator providers.

- [ ] **Step 2: Run endpoint tests to verify RED**

Run: `npm.cmd test -- --runInBand test/unit/actuator-excel/actuator-excel.controller.spec.ts test/unit/actuator-excel/actuator-excel.module.spec.ts`

Expected: FAIL because controller and module do not exist.

- [ ] **Step 3: Implement controller and module**

Use `@Controller('actuators/farms')`, `@Get(':farm/excel')`, `@Param('farm')`, and `@Res()` with the Express response as the workbook output. Validate slug with `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` before fetching.

Register a native fetch provider, client, and workbook service in `ActuatorExcelModule`; import `AppConfigurationModule`; then import `ActuatorExcelModule` in `AppModule`.

- [ ] **Step 4: Run endpoint tests to verify GREEN**

Run: `npm.cmd test -- --runInBand test/unit/actuator-excel/actuator-excel.controller.spec.ts test/unit/actuator-excel/actuator-excel.module.spec.ts`

Expected: PASS.

### Task 5: Full verification and real central-af export

**Files:**
- Create: `test/integration/actuator-excel/actuator-workbook.integration.spec.ts`
- Create during manual verification: `central-af-atuadores.xlsx`

**Interfaces:**
- Consumes: completed client, translator, endpoint wiring, and live local source at port 3100.
- Produces: validated real XLSX with exactly 37,619 data rows for the current `central-af` cache snapshot.

- [ ] **Step 1: Add integration artifact test**

Generate a small workbook to a temporary path, reopen it with ExcelJS, and assert sheet name, eight headers, parsed values, retained failure row, styles, autofilter, frozen pane, and exact row count.

- [ ] **Step 2: Run all tests and build**

Run: `npm.cmd test -- --runInBand`

Expected: all unit suites PASS.

Run: `npm.cmd run test:integration -- --runInBand`

Expected: all integration suites PASS.

Run: `npm.cmd run build`

Expected: Nest build exits 0.

- [ ] **Step 3: Verify live export**

Fetch `http://127.0.0.1:3100/actuators/farms/central-af`, validate the document, generate `central-af-atuadores.xlsx`, reopen it with ExcelJS, and compare workbook data row count with `summary.totalRows`.

Expected: one `Atuadores` worksheet, eight approved columns, and no missing or duplicated rows, including all failure notes.

- [ ] **Step 4: Clean temporary helpers and report artifact path**

Remove only one-off scripts used for manual verification. Keep `central-af-atuadores.xlsx` in the workspace for user inspection.

## Self-Review

- Spec coverage: endpoint, filename, single sheet, exact columns, read-only source, row limit, security, streaming, errors, and real export are each assigned to a task.
- Completeness scan: every implementation step contains exact files, commands, and expected behavior.
- Type consistency: schema produces `ActuatorCacheDocument`; client returns it; workbook service consumes it; controller composes both services.
- Repository note: commit steps are omitted because this workspace is not currently recognized as a valid Git repository.
