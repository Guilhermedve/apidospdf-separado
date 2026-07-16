export type {
  DatapoolDevice,
  DatapoolPeriodDocument,
  ReportPeriod,
} from './datapool.schema';

export type DatapoolFetch = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

export interface Clock {
  now(): Date;
}
