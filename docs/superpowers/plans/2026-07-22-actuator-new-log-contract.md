# Actuator New Log Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PDF API validate the new actuator snapshot and export one XLSX sheet with sector, actuator, timestamp, flow, volume, and note.

**Architecture:** Keep the existing HTTP client and public download route. Replace the old strict Zod contract with the new `sectors -> tables -> rows` hierarchy, then make the workbook stream flatten that hierarchy in deterministic order.

**Tech Stack:** NestJS 11, TypeScript 6, Zod 4, ExcelJS 4, Jest 30.

## Global Constraints

- Accept only the new actuator contract; reject top-level `tables`.
- Preserve `GET /actuators/farms/:farm/excel`.
- Export one sheet with `SETOR | ATUADOR | DATA/HORA | VAZÃO | VOLUME | NOTA`.
- Preserve the 1,048,575 data-row limit and current HTTP error mapping.
- Do not change the calculation API or trigger actuator scans from the PDF API.

---

### Task 1: Replace the actuator cache schema

**Files:**
- Create: `test/fixtures/actuator-excel/maringa-citrosuco-new-contract.json`
- Modify: `test/unit/actuator-excel/actuator-cache.schema.spec.ts`
- Modify: `src/actuator-excel/actuator-cache.schema.ts`

**Interfaces:**
- Consumes: JSON returned by `GET /actuators/farms/:farm`.
- Produces: `parseActuatorCacheDocument(input): ActuatorCacheDocument`, with `document.sectors[sector].tables[actuator]` rows typed as `{ TIME: string; FLOW: number; VOL: number; NOTE: string | null }`.

- [ ] **Step 1: Add a reduced real-contract fixture**

```json
{
  "farm": "Maringá - Citrosuco",
  "slug": "maringa-citrosuco",
  "generatedAt": "2026-07-22T13:30:00.000Z",
  "windowStart": "2026-07-15T13:30:00.000Z",
  "windowEnd": "2026-07-22T13:30:00.000Z",
  "summary": {
    "tables": 2,
    "rows": 3,
    "totalTables": 2,
    "tablesWithMatches": 2,
    "totalRows": 3
  },
  "sectors": {
    "SETOR_FILTRO_H_OP10_P2": {
      "tables": {
        "FILTRO_H_OP10_L2_P2A": [
          { "TIME": "2026-07-18T11:00:00.000Z", "FLOW": 12.5, "VOL": 80, "NOTE": "Ativado" }
        ]
      }
    },
    "SETOR_FILTRO_H_OP2_P2": {
      "tables": {
        "FILTRO_H_OP2_L114_P2A": [
          { "TIME": "2026-07-17T07:04:47.000Z", "FLOW": 0, "VOL": 0, "NOTE": null },
          { "TIME": "2026-07-17T07:00:05.000Z", "FLOW": 3.2, "VOL": 15, "NOTE": "$Ativado $" }
        ]
      }
    }
  },
  "errors": [{ "table": "FILTRO_INDISPONIVEL", "message": "Tabela indisponível" }]
}
```

- [ ] **Step 2: Rewrite schema tests to cover the new hierarchy**

Add assertions that the fixture parses, `NOTE: null` is accepted, invalid `TIME`, nonnumeric `FLOW`, mismatched `summary.tables`, and mismatched `summary.rows` are rejected, and a legacy document with top-level `tables` is rejected.

```ts
expect(parsed.sectors.SETOR_FILTRO_H_OP2_P2.tables.FILTRO_H_OP2_L114_P2A)
  .toHaveLength(2);
expect(() => parseActuatorCacheDocument(legacyDocument)).toThrow('sectors');
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npm.cmd test -- --runInBand test/unit/actuator-excel/actuator-cache.schema.spec.ts`

Expected: FAIL because the production schema still requires top-level `filter` and `tables`.

- [ ] **Step 4: Implement the strict new Zod schema**

```ts
const actuatorRowSchema = z.object({
  TIME: isoTimestampSchema,
  FLOW: z.number(),
  VOL: z.number(),
  NOTE: z.string().nullable(),
}).strict();

const actuatorSectorSchema = z.object({
  tables: z.record(z.string().trim().min(1), z.array(actuatorRowSchema)),
}).strict();
```

Define strict `summary`, optional strict `errors`, and `sectors`. In
`superRefine`, flatten all `sector.tables` values, count non-empty tables,
and enforce:

```ts
summary.tables === tableCount;
summary.tablesWithMatches === nonEmptyTableCount;
summary.totalTables === tableCount;
summary.rows === rowCount;
summary.totalRows === rowCount;
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npm.cmd test -- --runInBand test/unit/actuator-excel/actuator-cache.schema.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit the schema slice**

```bash
git add src/actuator-excel/actuator-cache.schema.ts test/unit/actuator-excel/actuator-cache.schema.spec.ts test/fixtures/actuator-excel/maringa-citrosuco-new-contract.json
git commit -m "feat: accept new actuator snapshot contract"
```

---

### Task 2: Export sectors and actuator measurements

**Files:**
- Modify: `test/unit/actuator-excel/actuator-workbook.service.spec.ts`
- Modify: `src/actuator-excel/actuator-workbook.service.ts`
- Delete: `src/actuator-excel/actuator-note.parser.ts`
- Delete: `test/unit/actuator-excel/actuator-note.parser.spec.ts`

**Interfaces:**
- Consumes: `ActuatorCacheDocument` from Task 1.
- Produces: `ActuatorWorkbookService.write(document, output): Promise<{ rows: number }>` with six columns.

- [ ] **Step 1: Rewrite workbook tests for the approved columns**

Load the fixture, generate the workbook, and assert:

```ts
expect(sheet.getRow(1).values).toEqual([
  undefined, 'SETOR', 'ATUADOR', 'DATA/HORA', 'VAZÃO', 'VOLUME', 'NOTA',
]);
expect(sheet.autoFilter).toBe('A1:F1');
```

Assert natural ordering by sector, actuator, and timestamp, preservation of numeric `FLOW`/`VOL`, and a blank Excel cell for `NOTE: null`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- --runInBand test/unit/actuator-excel/actuator-workbook.service.spec.ts`

Expected: FAIL because the workbook still reads `document.tables`, `ADDR`, and parsed FIR fields.

- [ ] **Step 3: Implement hierarchy flattening in the workbook writer**

Use one `Intl.Collator('pt-BR', { numeric: true })`. Sort sector names, then actuator names, then clone and sort rows by `Date.parse(row.TIME)`. Write:

```ts
worksheet.addRow([
  sector,
  actuator,
  new Date(row.TIME),
  row.FLOW,
  row.VOL,
  row.NOTE,
]);
```

Update widths, date formatting on column 3, filter `A1:F1`, and numeric alignment for columns 4 and 5. Remove the note-parser import.

- [ ] **Step 4: Remove the obsolete note parser and its tests**

Delete `src/actuator-excel/actuator-note.parser.ts` and `test/unit/actuator-excel/actuator-note.parser.spec.ts` after confirming no imports remain with:

Run: `rg -n "parseActuatorNote|actuator-note.parser" src test`

Expected: no matches.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `npm.cmd test -- --runInBand test/unit/actuator-excel/actuator-workbook.service.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit the workbook slice**

```bash
git add src/actuator-excel test/unit/actuator-excel
git commit -m "feat: export new actuator measurements"
```

---

### Task 3: Update client, controller, and integration coverage

**Files:**
- Modify: `test/unit/actuator-excel/actuator-cache.client.spec.ts`
- Modify: `test/unit/actuator-excel/actuator-excel.controller.spec.ts`
- Modify: `test/integration/actuator-excel/actuator-workbook.integration.spec.ts`

**Interfaces:**
- Consumes: fixture and schema from Task 1, workbook behavior from Task 2.
- Produces: regression coverage for the unchanged HTTP route and error mapping.

- [ ] **Step 1: Replace old inline documents with the new fixture shape**

Keep the client assertions for `GET`, URL encoding, optional Basic Auth, 404, transient upstream statuses, invalid contract, and network failure. Make the invalid-contract case delete `sectors`.

Update the controller fake document to use `summary.rows` and nested `sectors`; preserve filename, content type, unsafe-slug, 404, and Excel-limit tests.

- [ ] **Step 2: Update the integration workbook assertions**

Generate a physical XLSX from the fixture, reopen it, and assert six approved headers, three data rows, correct sector/actuator names, numeric flow and volume, nullable note, and `A1:F1` filter.

- [ ] **Step 3: Run actuator unit tests**

Run: `npm.cmd test -- --runInBand test/unit/actuator-excel`

Expected: all actuator unit suites PASS.

- [ ] **Step 4: Run actuator integration test**

Run: `npm.cmd test -- --config test/jest-integration.json --runInBand test/integration/actuator-excel/actuator-workbook.integration.spec.ts`

Expected: PASS and temporary XLSX removed by `afterEach`.

- [ ] **Step 5: Commit regression coverage**

```bash
git add test/unit/actuator-excel test/integration/actuator-excel
git commit -m "test: cover new actuator workbook contract"
```

---

### Task 4: Verify the complete API

**Files:**
- Modify only if verification exposes a scoped defect.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified build and test evidence.

- [ ] **Step 1: Run all unit tests**

Run: `npm.cmd test -- --runInBand`

Expected: all unit suites PASS.

- [ ] **Step 2: Run all integration tests**

Run: `npm.cmd test -- --config test/jest-integration.json --runInBand`

Expected: all integration suites PASS.

- [ ] **Step 3: Build TypeScript**

Run: `npm.cmd run build`

Expected: exit code 0.

- [ ] **Step 4: Check scope and repository state**

Run: `git diff --check && git status --short --branch`

Expected: no whitespace errors; only intentional commits ahead of `origin/main`.
