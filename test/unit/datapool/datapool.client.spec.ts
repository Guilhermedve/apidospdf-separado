import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppConfigService } from '../../../src/config/app-config.service';
import type { AppConfig } from '../../../src/config/app-config.schema';
import { DatapoolClient } from '../../../src/datapool/datapool.client';
import type { DatapoolFetch } from '../../../src/datapool/datapool.types';

const fixture = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      'test',
      'fixtures',
      'datapool',
      'entre-rios-3d.json',
    ),
    'utf8',
  ),
);

const appConfig: AppConfig = {
  port: 3000,
  apiKeys: ['test-key'],
  datapoolBaseUrl: 'https://datapool.example.ts.net',
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
  now = new Date('2026-07-10T15:00:00.000Z'),
  overrides: Partial<AppConfig> = {},
): DatapoolClient {
  return new DatapoolClient(
    new AppConfigService({ ...appConfig, ...overrides }),
    fetcher,
    { now: () => now },
  );
}

describe('DatapoolClient', () => {
  it('normaliza a descoberta remota e mantém somente períodos disponíveis', async () => {
    let capturedUrl = '';
    const fetcher: DatapoolFetch = async (url) => {
      capturedUrl = url;
      return jsonResponse([
        {
          name: 'Maringá - Citrosuco',
          slug: 'maringa-citrosuco',
          sshPort: 8101,
          periods: { '3h': true, '3d': true, '7d': false },
        },
        {
          name: 'Sem dados',
          slug: 'sem-dados',
          sshPort: 9999,
          periods: { '3h': false, '3d': false, '7d': false },
        },
      ]);
    };

    await expect(createClient(fetcher).getFarms()).resolves.toEqual({
      farms: [
        {
          name: 'Maringá - Citrosuco',
          slug: 'maringa-citrosuco',
          periods: ['3h', '3d'],
        },
      ],
    });
    expect(capturedUrl).toBe(
      'https://datapool.example.ts.net/diagnostics/farms',
    );
  });

  it('consulta somente o endpoint de leitura do período', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetcher: DatapoolFetch = async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonResponse(fixture);
    };

    const result = await createClient(fetcher).getPeriod(
      'entre rios/produção',
      '3d',
    );

    expect(capturedUrl).toBe(
      'https://datapool.example.ts.net/diagnostics/farms/' +
        'entre%20rios%2Fprodu%C3%A7%C3%A3o/periods/3d',
    );
    expect(capturedInit).toMatchObject({
      headers: {
        accept: 'application/json',
        'accept-encoding': 'gzip, br',
      },
      method: 'GET',
    });
    expect(capturedInit?.signal).toBeInstanceOf(AbortSignal);
    expect(
      (capturedInit?.headers as Record<string, string>)?.authorization,
    ).toBeUndefined();
    expect(result.summary.totalDevices).toBe(42);
  });

  it('envia Basic Auth quando há senha configurada (INTEGRATION.md §1)', async () => {
    let capturedInit: RequestInit | undefined;
    const fetcher: DatapoolFetch = async (_url, init) => {
      capturedInit = init;
      return jsonResponse(fixture);
    };

    await createClient(fetcher, undefined, {
      datapoolUser: 'admin',
      datapoolPassword: 's3nha',
    }).getPeriod('entre-rios', '3d');

    const expected = 'Basic ' + Buffer.from('admin:s3nha').toString('base64');
    expect(
      (capturedInit?.headers as Record<string, string>)?.authorization,
    ).toBe(expected);
  });

  it('recusa snapshot marcado como stale pela origem (INTEGRATION.md §5)', async () => {
    const changed = structuredClone(fixture);
    changed.stale = true;
    const fetcher: DatapoolFetch = async () => jsonResponse(changed);

    await expect(
      createClient(fetcher).getPeriod('entre-rios', '3d'),
    ).rejects.toMatchObject({
      code: 'DATAPOOL_DATA_STALE',
      retryable: false,
    });
  });

  it.each([429, 502, 503, 504])(
    'marca HTTP %s como falha transitória',
    async (status) => {
      const fetcher: DatapoolFetch = async () =>
        jsonResponse({ message: 'unavailable' }, status);

      await expect(
        createClient(fetcher).getPeriod('entre-rios', '3d'),
      ).rejects.toMatchObject({
        code: 'DATAPOOL_UNAVAILABLE',
        retryable: true,
      });
    },
  );

  it('traduz 404 como fazenda inexistente e não repetível', async () => {
    const fetcher: DatapoolFetch = async () =>
      jsonResponse({ message: 'not found' }, 404);

    await expect(
      createClient(fetcher).getPeriod('inexistente', '3d'),
    ).rejects.toMatchObject({
      code: 'FARM_NOT_FOUND',
      retryable: false,
    });
  });

  it('rejeita resposta fora do contrato', async () => {
    const changed = structuredClone(fixture);
    delete changed.summary;
    const fetcher: DatapoolFetch = async () => jsonResponse(changed);

    await expect(
      createClient(fetcher).getPeriod('entre-rios', '3d'),
    ).rejects.toMatchObject({
      code: 'DATAPOOL_CONTRACT_INVALID',
      retryable: false,
    });
  });

  it('rejeita período divergente na resposta', async () => {
    const changed = structuredClone(fixture);
    changed.period = '7d';
    const fetcher: DatapoolFetch = async () => jsonResponse(changed);

    await expect(
      createClient(fetcher).getPeriod('entre-rios', '3d'),
    ).rejects.toMatchObject({
      code: 'DATAPOOL_CONTRACT_INVALID',
      retryable: false,
    });
  });

  it('rejeita documento mais antigo que o limite configurado', async () => {
    const fetcher: DatapoolFetch = async () => jsonResponse(fixture);

    await expect(
      createClient(
        fetcher,
        new Date('2026-07-10T16:00:25.000Z'),
      ).getPeriod('entre-rios', '3d'),
    ).rejects.toMatchObject({
      code: 'DATAPOOL_DATA_STALE',
      retryable: false,
    });
  });

  it('marca erro de rede como transitório', async () => {
    const fetcher: DatapoolFetch = async () => {
      throw new TypeError('fetch failed');
    };

    await expect(
      createClient(fetcher).getPeriod('entre-rios', '3d'),
    ).rejects.toMatchObject({
      code: 'DATAPOOL_UNAVAILABLE',
      retryable: true,
    });
  });
});
