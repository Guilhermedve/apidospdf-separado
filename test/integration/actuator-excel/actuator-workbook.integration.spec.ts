import { createWriteStream } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { parseActuatorCacheDocument } from '../../../src/actuator-excel/actuator-cache.schema';
import { ActuatorWorkbookService } from '../../../src/actuator-excel/actuator-workbook.service';

describe('ActuatorWorkbookService integration', () => {
  const path = join(process.cwd(), 'tmp', 'actuator-workbook-integration.xlsx');

  afterEach(async () => {
    await rm(path, { force: true });
  });

  it('grava um XLSX que pode ser reaberto com todos os registros', async () => {
    const document = parseActuatorCacheDocument({
      farm: 'Central - AF',
      slug: 'central-af',
      generatedAt: '2026-07-13T12:00:00.000Z',
      windowStart: '2026-07-12T12:00:00.000Z',
      windowEnd: '2026-07-13T12:00:00.000Z',
      filter: { column: 'NOTE', contains: 'FIR' },
      summary: { totalTables: 1, tablesWithMatches: 1, totalRows: 2 },
      tables: {
        CX01: [
          {
            TIME: '2026-07-13T10:00:00.000Z',
            ADDR: 1,
            NOTE: "$'FIR206_AGUA' injetou 80 de 80 litros$",
          },
          {
            TIME: '2026-07-13T11:00:00.000Z',
            ADDR: 1,
            NOTE: '$Falha na fertirrigação. (FIR:233)$',
          },
        ],
      },
    });

    await new ActuatorWorkbookService().write(
      document,
      createWriteStream(path),
    );

    const workbook = new ExcelJS.Workbook();
    const bytes = (await readFile(path)) as unknown as Parameters<
      typeof workbook.xlsx.load
    >[0];
    await workbook.xlsx.load(bytes);
    const sheet = workbook.getWorksheet('Atuadores')!;

    expect(workbook.worksheets).toHaveLength(1);
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
    expect(sheet.rowCount - 1).toBe(document.summary.totalRows);
    expect(sheet.getRow(2).getCell(5).value).toBe('FIR206_AGUA');
    expect(sheet.getRow(2).getCell(6).value).toBe(80);
    expect(sheet.getRow(3).getCell(4).value).toBe(233);
    expect(sheet.getRow(3).getCell(5).value).toBeNull();
    expect(sheet.autoFilter).toBe('A1:H1');
  });
});
