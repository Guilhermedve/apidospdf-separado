import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const supplied = request.headers['x-api-key'];
    if (typeof supplied !== 'string' || !this.matches(supplied)) {
      throw new UnauthorizedException('Invalid API key');
    }
    return true;
  }

  private matches(supplied: string): boolean {
    const candidate = Buffer.from(supplied);
    return this.config.value.apiKeys.some((configured) => {
      const expected = Buffer.from(configured);
      return (
        candidate.length === expected.length &&
        timingSafeEqual(candidate, expected)
      );
    });
  }
}
