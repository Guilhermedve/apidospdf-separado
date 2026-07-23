import { PassThrough } from 'node:stream';
import ExcelJS from 'exceljs';
import { parseActuatorCacheDocument } from '../../../src/actuator-excel/actuator-cache.schema';
import {
  ActuatorWorkbookService,
  MAX_EXCEL_DATA_ROWS,
} from '../../../src/actuator-excel/actuator-workbook.service';

const fixture = require('../../fixtures/actuator-excel/maringa-citrosuco-new-contract.json') as unknown;
const document = parseActuatorCacheDocument(fixture);

async function generateWorkbook() {
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));

  const result = await new ActuatorWorkbookService().write(document, output);
  const workbook = new ExcelJS.Workbook();
  const bytes = Buffer.concat(chunks) as unknown as Parameters<
    typeof workbook.xlsx.load
  >[0];
  await workbook.xlsx.load(bytes);
  return { result, workbook };
}

describe('ActuatorWorkbookService', () => {
  it('gera somente a aba e as seis colunas aprovadas', async () => {
    const { result, workbook } = await generateWorkbook();
    const sheet = workbook.getWorksheet('Atuadores')!;

    expect(result.rows).toBe(3);
    expect(workbook.worksheets.map((item) => item.name)).toEqual([
      'Atuadores',
    ]);
    expect(sheet.getRow(1).values).toEqual([
      undefined,
      'SETOR',
      'ATUADOR',
      'DATA/HORA',
      'VAZÃO',
      'VOLUME',
      'NOTA',
    ]);
    expect(sheet.rowCount).toBe(4);
  });

  it('ordena naturalmente por setor, atuador e depois por data', async () => {
    const { workbook } = await generateWorkbook();
    const sheet = workbook.getWorksheet('Atuadores')!;

    expect(sheet.getRow(2).values).toEqual([
      undefined,
      'SETOR_FILTRO_H_OP2_P2',
      'FILTRO_H_OP2_L114_P2A',
      new Date('2026-07-17T07:00:05.000Z'),
      3.2,
      15,
      '$Ativado $',
    ]);
    expect(sheet.getRow(3).getCell(3).value).toEqual(
      new Date('2026-07-17T07:04:47.000Z'),
    );
    expect(sheet.getRow(4).getCell(1).value).toBe(
      'SETOR_FILTRO_H_OP10_P2',
    );
  });

  it('preserva vazao e volume numericos e deixa nota nula em branco', async () => {
    const { workbook } = await generateWorkbook();
    const sheet = workbook.getWorksheet('Atuadores')!;
    const nullNoteRow = sheet.getRow(3);

    expect(nullNoteRow.getCell(4).value).toBe(0);
    expect(nullNoteRow.getCell(5).value).toBe(0);
    expect(nullNoteRow.getCell(6).value).toBeNull();
  });

  it('configura filtro, cabecalho azul centralizado, bordas e data', async () => {
    const { workbook } = await generateWorkbook();
    const sheet = workbook.getWorksheet('Atuadores')!;
    const header = sheet.getRow(1);

    expect(sheet.autoFilter).toEqual('A1:F1');
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(sheet.getColumn(3).numFmt).toBe('dd/mm/yyyy hh:mm:ss');
    expect(header.font).toMatchObject({
      bold: true,
      color: { argb: 'FFFFFFFF' },
    });
    expect(header.fill).toMatchObject({
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' },
    });
    expect(header.alignment).toMatchObject({
      horizontal: 'center',
      vertical: 'middle',
    });
    expect(sheet.getRow(2).getCell(1).border.bottom?.style).toBe('thin');
  });

  it('rejeita volume acima do limite sem escrever linhas', async () => {
    const tooLarge = structuredClone(document);
    tooLarge.summary.totalRows = MAX_EXCEL_DATA_ROWS + 1;
    const output = new PassThrough();

    await expect(
      new ActuatorWorkbookService().write(tooLarge, output),
    ).rejects.toMatchObject({ code: 'ACTUATOR_TOO_LARGE' });
  });
});
