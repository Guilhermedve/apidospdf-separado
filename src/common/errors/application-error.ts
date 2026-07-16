import type { ErrorCode } from './error-codes';

export class ApplicationError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApplicationError';
  }
}
