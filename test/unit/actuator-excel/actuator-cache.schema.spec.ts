import { parseActuatorCacheDocument } from '../../../src/actuator-excel/actuator-cache.schema';

const validDocument = {
  farm: 'Central - AF',
  slug: 'central-af',
  generatedAt: '2026-07-13T12:00:00.000Z',
  windowStart: '2026-07-12T12:00:00.000Z',
  windowEnd: '2026-07-13T12:00:00.000Z',
  filter: { column: 'NOTE', contains: 'FIR' },
  summary: { totalTables: 2, tablesWithMatches: 1, totalRows: 2 },
  tables: {
    CX06_FLA25: [
      { TIME: '2026-07-13T10:00:00.000Z', ADDR: 25, NOTE: 'FIR ON' },
      { TIME: '2026-07-13T11:00:00.000Z', ADDR: 25, NOTE: 'FIR OFF' },
    ],
  },
};

describe('parseActuatorCacheDocument', () => {
  it('valida o documento e preserva nomes dinamicos de atuadores', () => {
    const parsed = parseActuatorCacheDocument(validDocument);

    expect(parsed.slug).toBe('central-af');
    expect(parsed.tables.CX06_FLA25).toHaveLength(2);
  });

  it('rejeita TIME invalido', () => {
    const changed = structuredClone(validDocument);
    changed.tables.CX06_FLA25[0].TIME = '13/07/2026 10:00';

    expect(() => parseActuatorCacheDocument(changed)).toThrow('TIME');
  });

  it('rejeita ADDR nao inteiro', () => {
    const changed = structuredClone(validDocument);
    changed.tables.CX06_FLA25[0].ADDR = 25.5;

    expect(() => parseActuatorCacheDocument(changed)).toThrow('ADDR');
  });

  it('rejeita registro sem NOTE', () => {
    const changed = structuredClone(validDocument) as Record<string, any>;
    delete changed.tables.CX06_FLA25[0].NOTE;

    expect(() => parseActuatorCacheDocument(changed)).toThrow('NOTE');
  });

  it('rejeita totalRows divergente das linhas reais', () => {
    const changed = structuredClone(validDocument);
    changed.summary.totalRows = 999;

    expect(() => parseActuatorCacheDocument(changed)).toThrow(
      'summary.totalRows',
    );
  });

  it('rejeita tablesWithMatches divergente das tabelas retornadas', () => {
    const changed = structuredClone(validDocument);
    changed.summary.tablesWithMatches = 2;

    expect(() => parseActuatorCacheDocument(changed)).toThrow(
      'summary.tablesWithMatches',
    );
  });
});
