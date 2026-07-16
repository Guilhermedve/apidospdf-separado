import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from '../../src/app.module';
import { DatapoolModule } from '../../src/datapool/datapool.module';

describe('AppModule', () => {
  it('carrega o módulo HTTP de descoberta de fazendas', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule);

    expect(imports).toContain(DatapoolModule);
  });
});
