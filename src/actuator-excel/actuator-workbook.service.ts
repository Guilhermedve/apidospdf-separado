import { Injectable } from '@nestjs/common';
import type { Writable } from 'node:stream';
import ExcelJS from 'exceljs';
import { ApplicationError } from '../common/errors/application-error';
import type { ActuatorCacheDocument } from './actuator-cache.schema';
import type { ActuatorWorkbookResult } from './actuator-excel.types';
import { parseActuatorNote } from './actuator-note.parser';

export const MAX_EXCEL_DATA_ROWS = 1_048_575;

@Injectable()
export class ActuatorWorkbookService {
  async write(
    document: ActuatorCacheDocument,
    output: Writable,
  ): Promise<ActuatorWorkbookResult> {
    if (document.summary.totalRows > MAX_EXCEL_DATA_ROWS) {
      throw new ApplicationError(
        'ACTUATOR_TOO_LARGE',
        `Actuator document exceeds ${MAX_EXCEL_DATA_ROWS} data rows`,
        false,
      );
    }

    try {
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: output,
        useStyles: true,
        useSharedStrings: true,
      });
      const worksheet = workbook.addWorksheet('Atuadores', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
      worksheet.columns = [
        { key: 'area', width: 24 },
        { key: 'time', width: 22, style: { numFmt: 'dd/mm/yyyy hh:mm:ss' } },
        { key: 'addr', width: 9 },
        { key: 'fir', width: 9 },
        { key: 'product', width: 28 },
        { key: 'injectedLiters', width: 16 },
        { key: 'programmedLiters', width: 18 },
        { key: 'note', width: 52 },
      ];
      worksheet.autoFilter = 'A1:H1';

      const header = worksheet.addRow([
        'ÁREA',
        'DATA/HORA',
        'ADDR',
        'FIR',
        'PRODUTO',
        'INJETADO (L)',
        'PROGRAMADO (L)',
        'NOTA',
      ]);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E78' },
      };
      header.alignment = { horizontal: 'center', vertical: 'middle' };
      header.height = 20;
      header.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFB4C6E7' } },
          left: { style: 'thin', color: { argb: 'FFB4C6E7' } },
          bottom: { style: 'thin', color: { argb: 'FFB4C6E7' } },
          right: { style: 'thin', color: { argb: 'FFB4C6E7' } },
        };
      });
      header.commit();

      const collator = new Intl.Collator('pt-BR', { numeric: true });
      const actuatorNames = Object.keys(document.tables).sort((left, right) =>
        collator.compare(left, right),
      );
      let rows = 0;

      for (const actuator of actuatorNames) {
        const actuatorRows = [...document.tables[actuator]].sort(
          (left, right) => Date.parse(left.TIME) - Date.parse(right.TIME),
        );
        for (const row of actuatorRows) {
          const parsed = parseActuatorNote(String(row.NOTE));
          const worksheetRow = worksheet.addRow([
            actuator,
            new Date(row.TIME),
            row.ADDR,
            parsed.fir,
            parsed.product,
            parsed.injectedLiters,
            parsed.programmedLiters,
            parsed.note,
          ]);
          worksheetRow.eachCell({ includeEmpty: true }, (cell, column) => {
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFD9E2F3' } },
              left: { style: 'thin', color: { argb: 'FFD9E2F3' } },
              bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
              right: { style: 'thin', color: { argb: 'FFD9E2F3' } },
            };
            cell.alignment = {
              vertical: 'middle',
              horizontal: column >= 3 && column <= 7 ? 'center' : 'left',
            };
          });
          worksheetRow.commit();
          rows += 1;
        }
      }

      worksheet.commit();
      await workbook.commit();
      return { rows };
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }
      throw new ApplicationError(
        'EXCEL_GENERATION_FAILED',
        'Failed to generate actuator workbook',
        true,
        { cause: error },
      );
    }
  }
}
