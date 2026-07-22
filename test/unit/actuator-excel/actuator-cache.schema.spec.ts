const maringaNewContractFixture = require('../../fixtures/actuator-excel/maringa-citrosuco-new-contract.json');
import { parseActuatorCacheDocument } from '../../../src/actuator-excel/actuator-cache.schema';

const validDocument = maringaNewContractFixture;

describe('parseActuatorCacheDocument', () => {
  it('valida o documento e preserva a nova hierarquia setores -> tabelas -> linhas', () => {
    const parsed = parseActuatorCacheDocument(validDocument);

    expect(parsed.slug).toBe('maringa-citrosuco');
    expect(
      parsed.sectors.SETOR_FILTRO_H_OP2_P2.tables.FILTRO_H_OP2_L114_P2A,
    ).toHaveLength(2);
    expect(
      parsed.sectors.SETOR_FILTRO_H_OP99_P2.tables.FILTRO_H_OP99_L1_P2A,
    ).toHaveLength(0);
    expect(
      parsed.sectors.SETOR_FILTRO_H_OP2_P2.tables.FILTRO_H_OP2_L114_P2A[0].NOTE,
    ).toBeNull();
  });

  it('rejeita TIME invalido', () => {
    const changed = structuredClone(validDocument);
    changed.sectors.SETOR_FILTRO_H_OP10_P2.tables.FILTRO_H_OP10_L2_P2A[0].TIME =
      '18/07/2026 11:00';

    expect(() => parseActuatorCacheDocument(changed)).toThrow('TIME');
  });

  it('rejeita FLOW nao numerico', () => {
    const changed = structuredClone(validDocument);
    changed.sectors.SETOR_FILTRO_H_OP10_P2.tables.FILTRO_H_OP10_L2_P2A[0].FLOW =
      '12.5';

    expect(() => parseActuatorCacheDocument(changed)).toThrow('FLOW');
  });

  it('rejeita summary.tables divergente da quantidade real de tabelas incluindo vazias', () => {
    const changed = structuredClone(validDocument);
    changed.summary.tables = 4;

    expect(() => parseActuatorCacheDocument(changed)).toThrow('summary.tables');
  });

  it('rejeita summary.rows divergente da quantidade real de linhas', () => {
    const changed = structuredClone(validDocument);
    changed.summary.rows = 999;

    expect(() => parseActuatorCacheDocument(changed)).toThrow('summary.rows');
  });

  it('rejeita tablesWithMatches divergente da quantidade real de tabelas nao vazias', () => {
    const changed = structuredClone(validDocument);
    changed.summary.tablesWithMatches = 3;

    expect(() => parseActuatorCacheDocument(changed)).toThrow(
      'summary.tablesWithMatches',
    );
  });

  it('rejeita contrato legado com tables no topo do documento', () => {
    const legacyDocument = {
      farm: 'Central - AF',
      slug: 'central-af',
      generatedAt: '2026-07-13T12:00:00.000Z',
      windowStart: '2026-07-12T12:00:00.000Z',
      windowEnd: '2026-07-13T12:00:00.000Z',
      filter: { column: 'NOTE', contains: 'FIR' },
      summary: { totalTables: 1, tablesWithMatches: 1, totalRows: 2 },
      tables: {
        CX06_FLA25: [
          { TIME: '2026-07-13T10:00:00.000Z', ADDR: 25, NOTE: 'FIR ON' },
        ],
      },
    };

    expect(() => parseActuatorCacheDocument(legacyDocument)).toThrow('sectors');
  });
});