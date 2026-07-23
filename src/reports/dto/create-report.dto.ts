import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import type { ReportPeriod } from '../../datapool/datapool.types';
import type { ReportType } from '../report-job.types';

function normalizeDeviceAddr(value: unknown): string {
  const text = String(value).trim();
  if (!/^\d{1,3}$/.test(text)) {
    return text;
  }

  return text.padStart(3, '0');
}

export class CreateReportDto {
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  farmSlug!: string;

  @IsIn(['3h', '3d', '7d'])
  period!: ReportPeriod;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value.map(normalizeDeviceAddr) : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^\d{3}$/, { each: true })
  deviceAddrs?: string[];

  @IsOptional()
  @IsIn(['simple', 'detailed'])
  reportType: ReportType = 'detailed';
}
