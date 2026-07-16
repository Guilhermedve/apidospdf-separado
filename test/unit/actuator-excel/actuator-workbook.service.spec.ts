import { PassThrough } from 'node:stream';
import ExcelJS from 'exceljs';
import { parseActuatorCacheDocument } from '../../../src/actuator-excel/actuator-cache.schema';
import {
  ActuatorWorkbookService,
  MAX_EXCEL_DATA_ROWS,
} from '../../../src/actuator-excel/actuator-workbook.service';

const document = parseActuatorCacheDocument({
  farm: 'Central - AF',
  slug: 'central-af',
  generatedAt: '2026-07-13T12:00:00.000Z',
  windowStart: '2026-07-12T12:00:00.000Z',
  windowEnd: '2026-07-13T12:00:00.000Z',
  filter: { column: 'NOTE', contains: 'FIR' },
  summary: { totalTables: 2, tablesWithMatches: 2, totalRows: 3 },
  tables: {
    CX10: [
      {
        TIME: '2026-07-13T11:00:00.000Z',
        ADDR: 10,
        NOTE: '$Falha na fertirrigação. (FIR:233)$',
      },
    ],
    CX02: [
      {
        TIME: '2026-07-13T10:30:00.000Z',
        ADDR: 2,
        NOTE: "$'FIR208_AGUA' injetou 45 de 45 litros$",
      },
      {
        TIME: '2026-07-13T09:30:00.000Z',
        ADDR: 2,
        NOTE: "$'FIR206-AGUA' injetou 80 de 90 litros$",
      },
    ],
  },
});

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
  it('gera somente a aba e as colunas aprovadas', async () => {
    const { result, workbook } = await generateWorkbook();
    const sheet = workbook.getWorksheet('Atuadores')!;

    expect(result.rows).toBe(3);
    expect(workbook.worksheets.map((item) => item.name)).toEqual([
      'Atuadores',
    ]);
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
    expect(sheet.rowCount).toBe(4);
  });

  it('ordena por atuador natural e depois por data', async () => {
    const { workbook } = await generateWorkbook();
    const sheet = workbook.getWorksheet('Atuadores')!;

    expect(sheet.getRow(2).getCell(1).value).toBe('CX02');
    expect(sheet.getRow(2).getCell(2).value).toEqual(
      new Date('2026-07-13T09:30:00.000Z'),
    );
    expect(sheet.getRow(3).getCell(2).value).toEqual(
      new Date('2026-07-13T10:30:00.000Z'),
    );
    expect(sheet.getRow(4).getCell(1).value).toBe('CX10');
  });

  it('preenche FIR, produto e volumes da nota de injecao', async () => {
    const { workbook } = await generateWorkbook();
    const sheet = workbook.getWorksheet('Atuadores')!;

    expect(sheet.getRow(3).getCell(3).value).toBe(2);
    expect(sheet.getRow(3).values).toEqual([
      undefined,
      'CX02',
      new Date('2026-07-13T10:30:00.000Z'),
      2,
      208,
      'FIR208_AGUA',
      45,
      45,
      'FIR208_AGUA injetou 45 de 45 litros',
    ]);
  });

  it('mantem falhas com FIR e colunas derivadas vazias', async () => {
    const { workbook } = await generateWorkbook();
    const sheet = workbook.getWorksheet('Atuadores')!;
    const failure = sheet.getRow(4);

    expect(failure.getCell(1).value).toBe('CX10');
    expect(failure.getCell(4).value).toBe(233);
    expect(failure.getCell(5).value).toBeNull();
    expect(failure.getCell(6).value).toBeNull();
    expect(failure.getCell(7).value).toBeNull();
    expect(failure.getCell(8).value).toBe(
      'Falha na fertirrigação. (FIR:233)',
    );
  });

  it('configura filtro, cabecalho azul centralizado, bordas e data', async () => {
    const { workbook } = await generateWorkbook();
    const sheet = workbook.getWorksheet('Atuadores')!;
    const header = sheet.getRow(1);

    expect(sheet.autoFilter).toEqual('A1:H1');
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(sheet.getColumn(2).numFmt).toBe('dd/mm/yyyy hh:mm:ss');
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
