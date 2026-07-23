import { createWriteStream } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { parseActuatorCacheDocument } from '../../../src/actuator-excel/actuator-cache.schema';
import { ActuatorWorkbookService } from '../../../src/actuator-excel/actuator-workbook.service';

const fixture = require('../../fixtures/actuator-excel/maringa-citrosuco-new-contract.json') as unknown;

describe('ActuatorWorkbookService integration', () => {
  const path = join(process.cwd(), 'tmp', 'actuator-workbook-integration.xlsx');

  afterEach(async () => {
    await rm(path, { force: true });
  });

  it('grava um XLSX que pode ser reaberto com o contrato novo', async () => {
    const document = parseActuatorCacheDocument(fixture);

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
      'SETOR',
      'ATUADOR',
      'DATA/HORA',
      'VAZÃO',
      'VOLUME',
      'NOTA',
    ]);
    expect(sheet.rowCount - 1).toBe(document.summary.totalRows);
    expect(sheet.getRow(2).getCell(1).value).toBe('SETOR_FILTRO_H_OP2_P2');
    expect(sheet.getRow(2).getCell(2).value).toBe(
      'FILTRO_H_OP2_L114_P2A',
    );
    expect(sheet.getRow(2).getCell(4).value).toBe(3.2);
    expect(sheet.getRow(2).getCell(5).value).toBe(15);
    expect(sheet.getRow(3).getCell(6).value).toBeNull();
    expect(sheet.autoFilter).toBe('A1:F1');
  });
});
