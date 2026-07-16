import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DeviceSelectionService } from '../../../src/battery/device-selection.service';
import { parseDatapoolPeriodDocument } from '../../../src/datapool/datapool.schema';

const document = parseDatapoolPeriodDocument(
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

describe('DeviceSelectionService', () => {
  const service = new DeviceSelectionService();

  it('mantém todos os dispositivos na ausência de filtro', () => {
    expect(service.select(document)).toHaveLength(42);
  });

  it('preserva a ordem solicitada', () => {
    expect(
      service.select(document, ['045', '038']).map((device) => device.addr),
    ).toEqual([45, 38]);
  });

  it('falha com código estável quando um ADDR não existe', () => {
    expect(() => service.select(document, ['999'])).toThrow(
      expect.objectContaining({
        code: 'DEVICE_NOT_FOUND',
        retryable: false,
      }),
    );
  });
});
