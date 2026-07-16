import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BatteryAnalysisService } from '../../../src/battery/battery-analysis.service';
import { BatteryReportMapper } from '../../../src/battery/battery-report.mapper';
import { parseDatapoolPeriodDocument } from '../../../src/datapool/datapool.schema';
import {
  HEALTHY_DAY,
  daySamples,
  healthSnapshot,
  legacySnapshot,
  makeDevice,
  makeDocument,
  rawRow,
} from './battery-analysis.helpers';

function loadDocument() {
  return parseDatapoolPeriodDocument(
    JSON.parse(
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
    ),
  );
}

function healthyRaw() {
  return [
    ...daySamples('2026-07-07', HEALTHY_DAY),
    ...daySamples('2026-07-08', HEALTHY_DAY),
    ...daySamples('2026-07-09', HEALTHY_DAY),
  ];
}

describe('BatteryReportMapper', () => {
  const mapper = new BatteryReportMapper(new BatteryAnalysisService());

  it('cria modelo interno com ADDR normalizado e metadados da fonte', () => {
    const document = loadDocument();
    const mapped = mapper.map(document, [document.devices['045']]);

    expect(mapped).toMatchObject({
      farm: 'entre rios',
      period: '3d',
      generatedAt: '2026-07-10T13:00:24.526Z',
      windowStart: '2026-07-07T13:00:00.000Z',
      windowEnd: '2026-07-10T13:00:00.000Z',
      sourceSummary: document.summary,
    });
    expect(mapped.devices).toHaveLength(1);
    expect(mapped.devices[0].addr).toBe('045');
  });

  it('ordena os registros brutos cronologicamente sem alterar a fonte', () => {
    const document = loadDocument();
    const device = document.devices['045'];
    const originalFirstTime = device.raw[0].time;
    device.raw.reverse();

    const mapped = mapper.map(document, [device]);

    expect(mapped.devices[0].raw[0].time).toBe(originalFirstTime);
    expect(device.raw[0].time).not.toBe(originalFirstTime);
  });

  it('conta somente baterias validas dentro da janela inclusiva', () => {
    const device = makeDevice({
      raw: [
        rawRow('2026-07-07T12:59:59.999Z', 12.4),
        rawRow('2026-07-07T13:00:00.000Z', 12.5),
        rawRow('2026-07-10T13:00:00.000Z', 12.6),
        rawRow('2026-07-10T13:00:00.001Z', 12.7),
        rawRow('2026-07-09T13:00:00.000Z', Number.NaN),
      ],
    });
    const document = makeDocument(device, {
      windowStart: '2026-07-07T13:00:00.000Z',
      windowEnd: '2026-07-10T13:00:00.000Z',
    });

    const mapped = mapper.map(document, [device]).devices[0];

    expect(mapped.samplesInPeriod).toBe(2);
    expect(mapped.hasDataInPeriod).toBe(true);
    expect(mapped.raw.map((row) => row.time)).toEqual([
      '2026-07-07T13:00:00.000Z',
      '2026-07-10T13:00:00.000Z',
    ]);
  });

  it('marca sem dados quando so existem registros antigos', () => {
    const device = makeDevice({
      raw: [rawRow('2025-01-01T00:00:00.000Z', 12.8)],
    });
    const document = makeDocument(device, {
      windowStart: '2026-07-07T13:00:00.000Z',
      windowEnd: '2026-07-10T13:00:00.000Z',
    });

    const mapped = mapper.map(document, [device]).devices[0];

    expect(mapped.samplesInPeriod).toBe(0);
    expect(mapped.hasDataInPeriod).toBe(false);
    expect(mapped.raw).toEqual([]);
  });

  it('copia estatisticas sem recalcular', () => {
    const document = loadDocument();
    const source = document.devices['045'];
    const mapped = mapper.map(document, [source]).devices[0];

    expect(mapped.stats).toEqual(source.stats);
    expect(mapped.stats).not.toBe(source.stats);
  });

  it('recalcula health e legacy localmente para dispositivo analisavel', () => {
    const device = makeDevice({
      raw: healthyRaw(),
      health: healthSnapshot({ flags: ['SUBSTITUIR'] }),
      legacy: legacySnapshot({ performance: 1 }),
    });
    const document = makeDocument(device, {
      windowStart: '2026-07-07T09:00:00.000Z',
    });

    const mapped = mapper.map(document, [device]).devices[0];

    // Diagnosis is derived from `raw`, not copied from the remote snapshot.
    expect(mapped.health.diagnosis).toBe('NORMAL');
    expect(mapped.health.validDays).toBe(3);
    expect(mapped.legacy).not.toBeNull();
    expect(mapped.legacy!.motivoBateria).not.toBe('remoto');
  });

  it('preserva flags e signals remotos ao recalcular', () => {
    const device = makeDevice({
      raw: healthyRaw(),
      health: healthSnapshot({
        flags: ['BROWNOUT_SUSPEITO'],
        signals: {
          brownout: { resets: 2, detected: true },
          chargeTrend: { slopePerDay: -0.3, days: 3, declining: true },
        },
      }),
    });
    const document = makeDocument(device);

    const mapped = mapper.map(document, [device]).devices[0];

    expect(mapped.health.flags).toEqual(['BROWNOUT_SUSPEITO']);
    expect(mapped.health.signals).toEqual({
      brownout: { resets: 2, detected: true },
      chargeTrend: { slopePerDay: -0.3, days: 3, declining: true },
    });
  });

  it('trata slopePerDay nulo como sinal ausente', () => {
    const device = makeDevice({
      raw: healthyRaw(),
      health: healthSnapshot({
        flags: [],
        signals: {
          brownout: { resets: 0, detected: false },
          chargeTrend: {
            slopePerDay: null as unknown as number,
            days: 0,
            declining: false,
          },
        },
      }),
    });
    const document = makeDocument(device);

    const mapped = mapper.map(document, [device]).devices[0];

    expect(mapped.health.signals).toBeUndefined();
  });

  it('usa fallback remoto quando o status nao e ready', () => {
    const device = makeDevice({
      status: 'offline',
      raw: healthyRaw(),
      health: healthSnapshot({ diagnosis: 'REMOTO' }),
      legacy: legacySnapshot({ statusBateria: 'REMOTO' }),
    });
    const document = makeDocument(device);

    const mapped = mapper.map(document, [device]).devices[0];

    expect(mapped.health.diagnosis).toBe('REMOTO');
    expect(mapped.legacy!.statusBateria).toBe('REMOTO');
  });

  it('usa fallback remoto quando o modelType e desconhecido', () => {
    const device = makeDevice({
      modelType: 'XPTO',
      raw: healthyRaw(),
      health: healthSnapshot({ diagnosis: 'REMOTO' }),
    });
    const document = makeDocument(device);

    const mapped = mapper.map(document, [device]).devices[0];

    expect(mapped.health.diagnosis).toBe('REMOTO');
  });

  it('usa fallback remoto quando nao ha registros validos', () => {
    const device = makeDevice({
      raw: daySamples('2026-07-09', [0, 0, 20]),
      health: healthSnapshot({ diagnosis: 'REMOTO' }),
    });
    const document = makeDocument(device);

    const mapped = mapper.map(document, [device]).devices[0];

    expect(mapped.health.diagnosis).toBe('REMOTO');
  });

  it('nao altera o dispositivo nem os registros de origem', () => {
    const device = makeDevice({ raw: healthyRaw() });
    const snapshotHealth = structuredClone(device.health);
    const snapshotRaw = structuredClone(device.raw);
    const document = makeDocument(device);

    mapper.map(document, [device]);

    expect(device.health).toEqual(snapshotHealth);
    expect(device.raw).toEqual(snapshotRaw);
  });
});
