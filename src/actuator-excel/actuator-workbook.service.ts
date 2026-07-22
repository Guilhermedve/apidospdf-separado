import { Injectable } from '@nestjs/common';
import type { Writable } from 'node:stream';
import ExcelJS from 'exceljs';
import { ApplicationError } from '../common/errors/application-error';
import type { ActuatorCacheDocument } from './actuator-cache.schema';
import type { ActuatorWorkbookResult } from './actuator-excel.types';

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
        { key: 'sector', width: 30 },
        { key: 'actuator', width: 32 },
        { key: 'time', width: 22, style: { numFmt: 'dd/mm/yyyy hh:mm:ss' } },
        { key: 'flow', width: 14 },
        { key: 'volume', width: 14 },
        { key: 'note', width: 52 },
      ];
      worksheet.autoFilter = 'A1:F1';

      const header = worksheet.addRow([
        'SETOR',
        'ATUADOR',
        'DATA/HORA',
        'VAZÃO',
        'VOLUME',
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
      const sectorNames = Object.keys(document.sectors).sort((left, right) =>
        collator.compare(left, right),
      );
      let rows = 0;

      for (const sector of sectorNames) {
        const tables = document.sectors[sector].tables;
        const actuatorNames = Object.keys(tables).sort((left, right) =>
          collator.compare(left, right),
        );

        for (const actuator of actuatorNames) {
          const actuatorRows = [...tables[actuator]].sort(
            (left, right) => Date.parse(left.TIME) - Date.parse(right.TIME),
          );

          for (const row of actuatorRows) {
            const worksheetRow = worksheet.addRow([
              sector,
              actuator,
              new Date(row.TIME),
              row.FLOW,
              row.VOL,
              row.NOTE,
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
                horizontal: column >= 3 && column <= 5 ? 'center' : 'left',
              };
            });
            worksheetRow.commit();
            rows += 1;
          }
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
