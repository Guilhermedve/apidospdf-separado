import type { ExecutionContext } from '@nestjs/common';
import { ApiKeyGuard } from '../../../src/auth/api-key.guard';

function context(value?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-api-key': value } }),
    }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  const guard = new ApiKeyGuard({
    value: { apiKeys: ['support-key', 'rotation-key'] },
  } as never);

  it('aceita uma chave configurada', () => {
    expect(guard.canActivate(context('rotation-key'))).toBe(true);
  });

  it.each([undefined, '', 'wrong'])('rejeita chave ausente ou invalida', (key) => {
    expect(() => guard.canActivate(context(key))).toThrow('Invalid API key');
  });
});
