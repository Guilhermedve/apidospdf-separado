import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReportDto } from '../../../src/reports/dto/create-report.dto';

async function validateInput(input: Record<string, unknown>) {
  const dto = plainToInstance(CreateReportDto, input);
  const errors = await validate(dto, {
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    whitelist: true,
  });
  return { dto, errors };
}

describe('CreateReportDto', () => {
  it('normaliza endereços para três dígitos', async () => {
    const { dto, errors } = await validateInput({
      farmSlug: 'entre-rios',
      period: '3d',
      deviceAddrs: [' 45 ', '038'],
    });

    expect(errors).toHaveLength(0);
    expect(dto.deviceAddrs).toEqual(['045', '038']);
  });

  it.each(['2h', '1d', '30d'])('rejeita período %s', async (period) => {
    const { errors } = await validateInput({
      farmSlug: 'entre-rios',
      period,
    });

    expect(errors.some((error) => error.property === 'period')).toBe(true);
  });

  it('rejeita lista vazia', async () => {
    const { errors } = await validateInput({
      farmSlug: 'entre-rios',
      period: '3d',
      deviceAddrs: [],
    });

    expect(errors.some((error) => error.property === 'deviceAddrs')).toBe(
      true,
    );
  });

  it('rejeita endereços duplicados depois da normalização', async () => {
    const { errors } = await validateInput({
      farmSlug: 'entre-rios',
      period: '3d',
      deviceAddrs: ['45', '045'],
    });

    expect(errors.some((error) => error.property === 'deviceAddrs')).toBe(
      true,
    );
  });

  it.each(['-1', '1000', 'abc', '4.5'])(
    'rejeita ADDR inválido %s',
    async (addr) => {
      const { errors } = await validateInput({
        farmSlug: 'entre-rios',
        period: '3d',
        deviceAddrs: [addr],
      });

      expect(errors.some((error) => error.property === 'deviceAddrs')).toBe(
        true,
      );
    },
  );

  it('rejeita propriedade desconhecida', async () => {
    const { errors } = await validateInput({
      farmSlug: 'entre-rios',
      period: '3d',
      days: 30,
    });

    expect(errors.some((error) => error.property === 'days')).toBe(true);
  });

  it('aceita a variante simple', async () => {
    const { dto, errors } = await validateInput({
      farmSlug: 'entre-rios',
      period: '3d',
      reportType: 'simple',
    });

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ reportType: 'simple' });
  });

  it('assume detailed quando a variante é omitida', async () => {
    const { dto, errors } = await validateInput({
      farmSlug: 'entre-rios',
      period: '3d',
    });

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ reportType: 'detailed' });
  });

  it('rejeita variante desconhecida', async () => {
    const { errors } = await validateInput({
      farmSlug: 'entre-rios',
      period: '3d',
      reportType: 'complete',
    });

    expect(
      errors.some((error) => error.property === 'reportType'),
    ).toBe(true);
  });
});
