import { Inject, Injectable } from '@nestjs/common';
import { ApplicationError } from '../common/errors/application-error';
import { AppConfigService } from '../config/app-config.service';
import type { DatapoolFetch } from '../datapool/datapool.types';
import {
  parseActuatorCacheDocument,
  type ActuatorCacheDocument,
} from './actuator-cache.schema';
import { actuatorCacheHttpError } from './actuator-excel.errors';

@Injectable()
export class ActuatorCacheClient {
  constructor(
    private readonly configService: AppConfigService,
    @Inject('ACTUATOR_FETCH') private readonly fetcher: DatapoolFetch,
  ) {}

  async getFarm(
    slug: string,
    externalSignal?: AbortSignal,
  ): Promise<ActuatorCacheDocument> {
    const config = this.configService.value;
    const url =
      `${config.datapoolBaseUrl}/actuators/farms/` +
      encodeURIComponent(slug);
    const timeoutSignal = AbortSignal.timeout(config.datapoolTimeoutMs);
    const signal = externalSignal
      ? AbortSignal.any([externalSignal, timeoutSignal])
      : timeoutSignal;
    const headers: Record<string, string> = {
      accept: 'application/json',
      'accept-encoding': 'gzip, br',
    };

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
        throw actuatorCacheHttpError(response.status);
      }

      try {
        return parseActuatorCacheDocument(await response.json());
      } catch (cause) {
        throw new ApplicationError(
          'ACTUATOR_CONTRACT_INVALID',
          'Actuator cache returned an invalid document',
          false,
          { cause },
        );
      }
    } catch (error) {
      if (error instanceof ApplicationError) {
        throw error;
      }

      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError')
      ) {
        throw new ApplicationError(
          'ACTUATOR_CACHE_TIMEOUT',
          'Actuator cache request timed out',
          true,
          { cause: error },
        );
      }

      throw new ApplicationError(
        'ACTUATOR_CACHE_UNAVAILABLE',
        'Actuator cache request failed before a valid response was received',
        true,
        { cause: error },
      );
    }
  }
}
