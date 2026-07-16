import { ApplicationError } from '../common/errors/application-error';

export function datapoolHttpError(status: number): ApplicationError {
  if (status === 404) {
    return new ApplicationError(
      'FARM_NOT_FOUND',
      'Farm or period was not found in the datapool',
      false,
    );
  }

  const retryable = [429, 502, 503, 504].includes(status);
  return new ApplicationError(
    'DATAPOOL_UNAVAILABLE',
    `Datapool request failed with HTTP ${status}`,
    retryable,
  );
}
