import { ApplicationError } from '../common/errors/application-error';

export function actuatorCacheHttpError(status: number): ApplicationError {
  if (status === 404) {
    return new ApplicationError(
      'ACTUATOR_CACHE_NOT_FOUND',
      'Actuator cache was not found for the requested farm',
      false,
    );
  }

  return new ApplicationError(
    'ACTUATOR_CACHE_UNAVAILABLE',
    `Actuator cache request failed with HTTP ${status}`,
    [429, 502, 503, 504].includes(status),
  );
}
