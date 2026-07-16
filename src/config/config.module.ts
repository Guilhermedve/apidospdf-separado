import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './app-config.service';
import { parseAppConfig } from './app-config.schema';

@Global()
@Module({
  providers: [
    {
      provide: 'APP_CONFIG',
      useFactory: () => parseAppConfig(process.env),
    },
    AppConfigService,
  ],
  exports: [AppConfigService],
})
export class AppConfigurationModule {}
