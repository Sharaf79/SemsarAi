import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsUUID } from 'class-validator';
import { MatchingEngineService } from './matching-engine.service';

/**
 * Guards `/internal/*` routes with a shared secret from env
 * `INTERNAL_WEBHOOK_SECRET` passed via `x-internal-secret` header.
 */
@Injectable()
export class InternalSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const expected = this.config.get<string>('INTERNAL_WEBHOOK_SECRET');
    if (!expected) throw new UnauthorizedException('Internal secret not configured');
    if (req.headers['x-internal-secret'] !== expected) {
      throw new UnauthorizedException('Invalid internal secret');
    }
    return true;
  }
}

class PropertyActivatedDto {
  @IsUUID('4')
  propertyId!: string;
}

class PropertyClosedDto {
  @IsUUID('4')
  propertyId!: string;
}

@Controller('internal/events')
@UseGuards(InternalSecretGuard)
export class InternalController {
  private readonly logger = new Logger(InternalController.name);

  constructor(private readonly engine: MatchingEngineService) {}

  @Post('property-activated')
  @HttpCode(HttpStatus.ACCEPTED)
  async propertyActivated(@Body() dto: PropertyActivatedDto) {
    this.logger.log(`property-activated propertyId=${dto.propertyId}`);
    // Phase A: run inline; Phase B: enqueue BullMQ job
    const count = await this.engine.matchProperty(dto.propertyId);
    return { status: 'ok', matched: count };
  }

  @Post('property-closed')
  @HttpCode(HttpStatus.ACCEPTED)
  async propertyClosed(@Body() dto: PropertyClosedDto) {
    this.logger.log(`property-closed propertyId=${dto.propertyId}`);
    const count = await this.engine.closeMatchesForProperty(dto.propertyId);
    return { status: 'ok', closed: count };
  }
}
