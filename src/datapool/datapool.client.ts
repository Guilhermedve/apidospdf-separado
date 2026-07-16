import { Inject, Injectable } from '@nestjs/common';
import { ApplicationError } from '../common/errors/application-error';
import { AppConfigService } from '../config/app-config.service';
import {
  parseDatapoolPeriodDocument,
  parseDatapoolFarmDiscovery,
  type DatapoolPeriodDocument,
  type FarmDiscovery,
  type ReportPeriod,
} from './datapool.schema';
import { datapoolHttpError } from './datapool.errors';
import type { Clock, DatapoolFetch } from './datapool.types';

@Injectable()
export class DatapoolClient {
  constructor(
    private readonly configService: AppConfigService,
    @Inject('DATAPOOL_FETCH') private readonly fetcher: DatapoolFetch,
    @Inject('DATAPOOL_CLOCK') private readonly clock: Clock,
  ) {}

  async getFarms(): Promise<FarmDiscovery> {
    const config = this.configService.value;
    const url = `${config.datapoolBaseUrl}/diagnostics/farms`;
    const headers: Record<string, string> = { accept: 'application/json' };
    if (config.datapoolPassword !== '') {
      headers.authorization =
        'Basic ' +
        Buffer.from(
          `${config.datapoolUser}:${config.datapoolPassword}`,
        ).toString('base64');
    }

    try {
      const response = await this.fetcher(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(config.datapoolTimeoutMs),
      });
      if (!response.ok) throw datapoolHttpError(response.status);
      try {
        return parseDatapoolFarmDiscovery(await response.json());
      } catch (error) {
        throw new ApplicationError(
          'DATAPOOL_CONTRACT_INVALID',
          'Datapool returned invalid farm discovery',
          false,
          { cause: error },
        );
      }
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        'DATAPOOL_UNAVAILABLE',
        'Datapool farm discovery failed',
        true,
        { cause: error },
      );
    }
  }

  async getPeriod(
    farmSlug: string,
    period: ReportPeriod,
    externalSignal?: AbortSignal,
  ): Promise<DatapoolPeriodDocument> {
    const config = this.configService.value;
    const url =
      `${config.datapoolBaseUrl}/diagnostics/farms/` +
      `${encodeURIComponent(farmSlug)}/periods/${period}`;
    const timeoutSignal = AbortSignal.timeout(config.datapoolTimeoutMs);
    const signal = externalSignal
      ? AbortSignal.any([externalSignal, timeoutSignal])
      : timeoutSignal;

    const headers: Record<string, string> = {
      accept: 'application/json',
      'accept-encoding': 'gzip, br',
    };
    // INTEGRATION.md §1: com API_PASSWORD definido, toda rota exige Basic Auth.
    // Senha vazia (dev local) => auth desligada, header omitido.
    if (config.datapoolPassword !== '') {
      const credentials = Buffer.from(
        `${config.datapoolUser}:${config.datapoolPassword}`,
      ).toString('base64');
      headers.authorization = `Basic ${credentials}`;
    }

    try {
      const response = await this.fetcher(url, {
        method: 'GET',
        headers,
        signal,
      });

      if (!response.ok) {
        throw datapoolHttpError(response.status);
      }

      let document: DatapoolPeriodDocument;
      try {
        document = parseDatapoolPeriodDocument(await response.json());
      } catch (error) {
        throw new ApplicationError(
          'DATAPOOL_CONTRACT_INVALID',
          'Datapool returned an invalid period document',
          false,
          { cause: error },
        );
      }

      if (document.period !== period) {
        throw new ApplicationError(
          'DATAPOOL_CONTRACT_INVALID',
          `Datapool returned period ${document.period} instead of ${period}`,
          false,
        );
      }

      return document;
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }

      throw new ApplicationError(
        'DATAPOOL_UNAVAILABLE',
        'Datapool request failed before a valid response was received',
        true,
        { cause: error },
      );
    }
  }
}
