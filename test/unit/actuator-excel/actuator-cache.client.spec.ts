import { ActuatorCacheClient } from '../../../src/actuator-excel/actuator-cache.client';
import { AppConfigService } from '../../../src/config/app-config.service';
import type { AppConfig } from '../../../src/config/app-config.schema';
import type { DatapoolFetch } from '../../../src/datapool/datapool.types';

const validDocument = require('../../fixtures/actuator-excel/maringa-citrosuco-new-contract.json') as unknown;

const appConfig: AppConfig = {
  port: 3000,
  apiKeys: ['test-key'],
  datapoolBaseUrl: 'https://datapool.example',
  datapoolTimeoutMs: 60_000,
  datapoolMaxAgeMinutes: 180,
  datapoolUser: 'admin',
  datapoolPassword: '',
  redisUrl: 'redis://redis:6379',
  reportsStoragePath: './storage/reports',
  reportRetentionMinutes: 30,
  reportWorkerConcurrency: 2,
  pdfTimeoutMs: 60_000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createClient(
  fetcher: DatapoolFetch,
  overrides: Partial<AppConfig> = {},
): ActuatorCacheClient {
  return new ActuatorCacheClient(
    new AppConfigService({ ...appConfig, ...overrides }),
    fetcher,
  );
}

describe('ActuatorCacheClient', () => {
  it('consulta somente o cache de leitura da fazenda', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetcher: DatapoolFetch = async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse(validDocument);
    };

    const result = await createClient(fetcher).getFarm('central-af');

    expect(capturedUrl).toBe(
      'https://datapool.example/actuators/farms/central-af',
    );
    expect(capturedUrl).not.toContain('/run');
    expect(capturedInit).toMatchObject({
      method: 'GET',
      headers: { accept: 'application/json', 'accept-encoding': 'gzip, br' },
    });
    expect(capturedInit?.signal).toBeInstanceOf(AbortSignal);
    expect(result.summary.totalRows).toBe(3);
  });

  it('codifica o slug na URL', async () => {
    let capturedUrl = '';
    const fetcher: DatapoolFetch = async (url) => {
      capturedUrl = url;
      return jsonResponse(validDocument);
    };

    await createClient(fetcher).getFarm('central af/produção');

    expect(capturedUrl.endsWith(
      '/actuators/farms/central%20af%2Fprodu%C3%A7%C3%A3o',
    )).toBe(true);
  });

  it('envia Basic Auth quando configurado', async () => {
    let capturedInit: RequestInit | undefined;
    const fetcher: DatapoolFetch = async (_url, init) => {
      capturedInit = init;
      return jsonResponse(validDocument);
    };

    await createClient(fetcher, {
      datapoolUser: 'admin',
      datapoolPassword: 'segredo',
    }).getFarm('central-af');

    expect(
      (capturedInit?.headers as Record<string, string>).authorization,
    ).toBe(`Basic ${Buffer.from('admin:segredo').toString('base64')}`);
  });

  it('traduz 404 como cache de atuadores inexistente', async () => {
    const fetcher: DatapoolFetch = async () => jsonResponse({}, 404);

    await expect(createClient(fetcher).getFarm('inexistente')).rejects.toMatchObject({
      code: 'ACTUATOR_CACHE_NOT_FOUND',
      retryable: false,
    });
  });

  it.each([429, 502, 503, 504])(
    'marca HTTP %s como indisponibilidade transitória',
    async (status) => {
      const fetcher: DatapoolFetch = async () => jsonResponse({}, status);

      await expect(createClient(fetcher).getFarm('central-af')).rejects.toMatchObject({
        code: 'ACTUATOR_CACHE_UNAVAILABLE',
        retryable: true,
      });
    },
  );

  it('rejeita resposta fora do contrato', async () => {
    const invalid = structuredClone(validDocument) as Record<string, unknown>;
    delete invalid.sectors;
    const fetcher: DatapoolFetch = async () => jsonResponse(invalid);

    await expect(createClient(fetcher).getFarm('central-af')).rejects.toMatchObject({
      code: 'ACTUATOR_CONTRACT_INVALID',
      retryable: false,
    });
  });

  it('marca falha de rede como indisponibilidade transitória', async () => {
    const fetcher: DatapoolFetch = async () => {
      throw new TypeError('fetch failed');
    };

    await expect(createClient(fetcher).getFarm('central-af')).rejects.toMatchObject({
      code: 'ACTUATOR_CACHE_UNAVAILABLE',
      retryable: true,
    });
  });
});
