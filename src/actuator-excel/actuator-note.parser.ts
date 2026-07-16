export interface ParsedActuatorNote {
  fir?: number;
  product?: string;
  injectedLiters?: number;
  programmedLiters?: number;
  note: string;
}

const INJECTION_NOTE =
  /^'?(?<product>FIR(?<fir>\d+)[^'\s]*)'?\s+injetou\s+(?<injected>\d+(?:[.,]\d+)?)\s+de\s+(?<programmed>\d+(?:[.,]\d+)?)\s+litros$/i;
const FIR_REFERENCE = /\bFIR\s*:?\s*(?<fir>\d+)\b/i;

function parseLiters(value: string): number {
  return Number(value.replace(',', '.'));
}

export function parseActuatorNote(rawNote: string): ParsedActuatorNote {
  const trimmed = rawNote.trim();
  const unwrapped =
    trimmed.startsWith('$') && trimmed.endsWith('$')
      ? trimmed.slice(1, -1).trim()
      : trimmed;
  const injection = INJECTION_NOTE.exec(unwrapped);

  if (injection?.groups) {
    const product = injection.groups.product;
    const note = unwrapped.replace(/^'([^']+)'/, '$1');
    return {
      fir: Number(injection.groups.fir),
      product,
      injectedLiters: parseLiters(injection.groups.injected),
      programmedLiters: parseLiters(injection.groups.programmed),
      note,
    };
  }

  const firReference = FIR_REFERENCE.exec(unwrapped);
  return {
    fir: firReference?.groups ? Number(firReference.groups.fir) : undefined,
    product: undefined,
    injectedLiters: undefined,
    programmedLiters: undefined,
    note: unwrapped,
  };
}
