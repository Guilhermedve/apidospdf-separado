import { parseActuatorNote } from '../../../src/actuator-excel/actuator-note.parser';

describe('parseActuatorNote', () => {
  it('interpreta uma nota de injecao e remove o involucro tecnico', () => {
    expect(
      parseActuatorNote("$'FIR233-AGUA' injetou 45 de 45 litros$"),
    ).toEqual({
      fir: 233,
      product: 'FIR233-AGUA',
      injectedLiters: 45,
      programmedLiters: 45,
      note: 'FIR233-AGUA injetou 45 de 45 litros',
    });
  });

  it('aceita volumes decimais com virgula', () => {
    expect(
      parseActuatorNote("$'FIR121_NUTRIENTE' injetou 12,5 de 20,75 litros$"),
    ).toEqual({
      fir: 121,
      product: 'FIR121_NUTRIENTE',
      injectedLiters: 12.5,
      programmedLiters: 20.75,
      note: 'FIR121_NUTRIENTE injetou 12,5 de 20,75 litros',
    });
  });

  it('mantem uma falha com FIR e sem produto ou volumes', () => {
    expect(
      parseActuatorNote('$Falha na fertirrigação. (FIR:233)$'),
    ).toEqual({
      fir: 233,
      product: undefined,
      injectedLiters: undefined,
      programmedLiters: undefined,
      note: 'Falha na fertirrigação. (FIR:233)',
    });
  });

  it('preserva uma nota desconhecida sem descartar o registro', () => {
    expect(parseActuatorNote('$Evento FIR sem formato conhecido$')).toEqual({
      fir: undefined,
      product: undefined,
      injectedLiters: undefined,
      programmedLiters: undefined,
      note: 'Evento FIR sem formato conhecido',
    });
  });
});
