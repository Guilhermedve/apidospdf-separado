import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDatapoolPeriodDocument } from '../../../src/datapool/datapool.schema';

const fixturePath = join(
  process.cwd(),
  'test',
  'fixtures',
  'datapool',
  'entre-rios-3d.json',
);
const fixture: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));

function cloneFixture(): any {
  return structuredClone(fixture);
}

describe('parseDatapoolPeriodDocument', () => {
  it('aceita a fixture real de 3d', () => {
    const parsed = parseDatapoolPeriodDocument(fixture);

    expect(parsed.period).toBe('3d');
    expect(Object.keys(parsed.devices)).toHaveLength(42);
    expect(parsed.summary.totalRows).toBe(10_798);
  });

  it('rejeita chave de mapa diferente do addr normalizado', () => {
    const changed = cloneFixture();
    changed.devices['045'].addr = 44;

    expect(() => parseDatapoolPeriodDocument(changed)).toThrow(
      'devices.045.addr',
    );
  });

  it('rejeita janela temporal invertida', () => {
    const changed = cloneFixture();
    changed.windowStart = changed.windowEnd;

    expect(() => parseDatapoolPeriodDocument(changed)).toThrow(
      'windowStart',
    );
  });

  it('rejeita timestamp inválido', () => {
    const changed = cloneFixture();
    changed.generatedAt = '10/07/2026 13:00';

    expect(() => parseDatapoolPeriodDocument(changed)).toThrow(
      'generatedAt',
    );
  });

  it('rejeita dispositivo sem dados brutos', () => {
    const changed = cloneFixture();
    delete changed.devices['045'].raw;

    expect(() => parseDatapoolPeriodDocument(changed)).toThrow(
      'devices.045.raw',
    );
  });

  it('rejeita período fora da allowlist', () => {
    const changed = cloneFixture();
    changed.period = '30d';

    expect(() => parseDatapoolPeriodDocument(changed)).toThrow('period');
  });

  it('assume flags vazio quando a origem omite (INTEGRATION.md §4)', () => {
    const parsed = parseDatapoolPeriodDocument(fixture);

    expect(parsed.devices['045'].health.flags).toEqual([]);
  });

  it('aceita flags e signals ortogonais ao diagnosis', () => {
    const changed = cloneFixture();
    changed.devices['045'].health.flags = ['BROWNOUT', 'CARGA_DEGRADANDO'];
    changed.devices['045'].health.signals = {
      brownout: { resets: 4, detected: true },
      chargeTrend: { slopePerDay: 0.125, days: 3, declining: false },
    };

    const parsed = parseDatapoolPeriodDocument(changed);

    expect(parsed.devices['045'].health.flags).toContain('BROWNOUT');
    expect(parsed.devices['045'].health.signals?.brownout.resets).toBe(4);
  });

  it('aceita o campo stale de frescor no topo (INTEGRATION.md §5)', () => {
    const changed = cloneFixture();
    changed.stale = true;

    expect(parseDatapoolPeriodDocument(changed).stale).toBe(true);
  });
});
