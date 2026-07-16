import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from './app-config.schema';

@Injectable()
export class AppConfigService {
  readonly value: Readonly<AppConfig>;

  constructor(@Inject('APP_CONFIG') config: AppConfig) {
    this.value = Object.freeze(config);
  }
}
