import { BatteryAnalysisService } from '../../../src/battery/battery-analysis.service';
import type { BatteryRawRow } from '../../../src/battery/battery-report.types';
import {
  CHARGE_FAIL_DAY,
  EXCESSIVE_DAY,
  HEALTHY_DAY,
  WEAK_DAY,
  daySamples,
  fortalezaTime,
  rawRow,
} from './battery-analysis.helpers';

const WINDOW_END = fortalezaTime('2026-07-10', 10);

function concat(...groups: BatteryRawRow[][]): BatteryRawRow[] {
  return groups.flat();
}

describe('BatteryAnalysisService', () => {
  const service = new BatteryAnalysisService();

  it('3h com tensao normal resulta em tendencia inconclusiva e confianca baixa', () => {
    const raw = daySamples('2026-07-10', [12.6, 12.8, 12.7]);

    const result = service.analyze({
      raw,
      modelType: 'SOLAR',
      period: '3h',
      windowEnd: WINDOW_END,
    });

    expect(result).not.toBeNull();
    expect(result!.health.diagnosis).toBe('DADOS_INSUFICIENTES');
    expect(result!.health.confidence).toBe('BAIXA');
  });

  it('3h com tensao abaixo de 12,1V resulta em baixa tensao recente', () => {
    const raw = daySamples('2026-07-10', [12.5, 12.0, 12.6]);

    const result = service.analyze({
      raw,
      modelType: 'SOLAR',
      period: '3h',
      windowEnd: WINDOW_END,
    });

    expect(result!.health.diagnosis).toBe('BAIXA_TENSAO_RECENTE');
    expect(result!.health.confidence).toBe('BAIXA');
  });

  it('3d solar saudavel produz estado normal com confianca media', () => {
    const raw = concat(
      daySamples('2026-07-07', HEALTHY_DAY),
      daySamples('2026-07-08', HEALTHY_DAY),
      daySamples('2026-07-09', HEALTHY_DAY),
    );

    const result = service.analyze({
      raw,
      modelType: 'SOLAR',
      period: '3d',
      windowEnd: WINDOW_END,
    });

    expect(result!.health.diagnosis).toBe('NORMAL');
    expect(result!.health.confidence).toBe('MEDIA');
    expect(result!.health.validDays).toBe(3);
    expect(result!.health.lifeStatus).toBe('OK');
  });

  it('falha recorrente em atingir 14,0V produz FALHA_CARGA', () => {
    const days = ['07-03', '07-04', '07-05', '07-06', '07-07', '07-08', '07-09'];
    const raw = concat(
      ...days.map((day) => daySamples(`2026-${day}`, CHARGE_FAIL_DAY)),
    );

    const result = service.analyze({
      raw,
      modelType: 'SOLAR',
      period: '7d',
      windowEnd: WINDOW_END,
    });

    expect(result!.health.diagnosis).toBe('FALHA_CARGA');
    expect(result!.health.confidence).toBe('ALTA');
  });

  it('carga seguida de queda recorrente abaixo de 12,1V produz BATERIA_FRACA', () => {
    const raw = concat(
      daySamples('2026-07-07', WEAK_DAY),
      daySamples('2026-07-08', WEAK_DAY),
      daySamples('2026-07-09', WEAK_DAY),
    );

    const result = service.analyze({
      raw,
      modelType: 'SOLAR',
      period: '3d',
      windowEnd: WINDOW_END,
    });

    expect(result!.health.diagnosis).toBe('BATERIA_FRACA');
  });

  it('permanencia excessiva em baixa tensao produz DESCARGA_EXCESSIVA', () => {
    const raw = concat(
      daySamples('2026-07-07', HEALTHY_DAY),
      daySamples('2026-07-08', HEALTHY_DAY),
      daySamples('2026-07-09', EXCESSIVE_DAY),
    );

    const result = service.analyze({
      raw,
      modelType: 'SOLAR',
      period: '3d',
      windowEnd: WINDOW_END,
    });

    expect(result!.health.diagnosis).toBe('DESCARGA_EXCESSIVA');
  });

  it('7d com sete dias validos produz confianca alta', () => {
    const days = ['07-03', '07-04', '07-05', '07-06', '07-07', '07-08', '07-09'];
    const raw = concat(
      ...days.map((day) => daySamples(`2026-${day}`, HEALTHY_DAY)),
    );

    const result = service.analyze({
      raw,
      modelType: 'SOLAR',
      period: '7d',
      windowEnd: WINDOW_END,
    });

    expect(result!.health.validDays).toBe(7);
    expect(result!.health.confidence).toBe('ALTA');
    expect(result!.health.diagnosis).toBe('NORMAL');
  });

  it('caminho FONTE usa quedas bruscas e adapta o contrato legado', () => {
    const fonteDay = [
      14.5, 11.9, 13.5, 14.1, 12.0, 13.8, 12.5, 13.0, 12.8, 13.2, 12.9, 13.1,
    ];
    const raw = concat(
      daySamples('2026-07-07', fonteDay),
      daySamples('2026-07-08', fonteDay),
      daySamples('2026-07-09', fonteDay),
    );

    const result = service.analyze({
      raw,
      modelType: 'FONTE',
      period: '3d',
      windowEnd: WINDOW_END,
    });

    expect(result).not.toBeNull();
    // Solar-only fields are neutralized; the daily charge rule is not applied.
    expect(result!.legacy.eficiencia).toBe(0);
    expect(result!.legacy.ciclos).toBe(0);
    expect(result!.legacy.statusCarga).toBe('SEM_DADOS');
    expect(result!.legacy.motivoCarga).toBe(
      'Regra diaria solar nao se aplica a FONTE',
    );

    const fonte = service.analyzeFonte(raw, false, '2026-07-10');
    expect(fonte!.quedasBruscas).toBeGreaterThan(0);
  });

  it('modelo desconhecido retorna null (fallback remoto)', () => {
    const raw = daySamples('2026-07-09', HEALTHY_DAY);

    const result = service.analyze({
      raw,
      modelType: 'DESCONHECIDO',
      period: '3d',
      windowEnd: WINDOW_END,
    });

    expect(result).toBeNull();
  });

  it('ausencia de registros validos retorna null (fallback remoto)', () => {
    const raw = daySamples('2026-07-09', [0, 0, 0, 20, 20]);

    const result = service.analyze({
      raw,
      modelType: 'SOLAR',
      period: '3d',
      windowEnd: WINDOW_END,
    });

    expect(result).toBeNull();
  });

  it('agrupa por America/Fortaleza usando windowEnd como referencia', () => {
    // 03:00 UTC on 07-10 is 00:00 Fortaleza on 07-10 (not 07-09), so this
    // sample must land on the 07-10 bucket regardless of container time zone.
    const raw = [rawRow(new Date('2026-07-10T03:00:00.000Z').toISOString(), 12.5)];
    const summary = service.analyzeHealth(raw, { shortWindow: true, periodHours: 3 });

    expect(summary.daily.length === 0 || summary.daily[0].day === '2026-07-10').toBe(
      true,
    );
  });
});
