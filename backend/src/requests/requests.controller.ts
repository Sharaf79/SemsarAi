import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/guards/jwt-auth.guard';
import { RequestStatus, RequestUrgency } from '@prisma/client';

@Controller('requests')
@UseGuards(JwtAuthGuard)
export class RequestsController {
  private readonly logger = new Logger(RequestsController.name);

  constructor(private readonly service: RequestsService) {}

  // ─── POST /requests ──────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateRequestDto) {
    this.logger.debug(`POST /requests — user=${user.sub}`);
    return this.service.create(user.sub, dto);
  }

  // ─── GET /requests ───────────────────────────────────────────

  @Get()
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: RequestStatus,
    @Query('urgency') urgency?: RequestUrgency,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(user.sub, {
      status,
      urgency,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  // ─── GET /requests/:id ───────────────────────────────────────

  @Get(':id')
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.service.findOne(user.sub, id);
  }

  // ─── PATCH /requests/:id ─────────────────────────────────────

  @Patch(':id')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateRequestDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }

  // ─── DELETE /requests/:id (soft close) ───────────────────────

  @Delete(':id')
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.service.remove(user.sub, id);
  }

  // ─── POST /requests/:id/pause ────────────────────────────────

  @Post(':id/pause')
  async pause(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.service.pause(user.sub, id);
  }

  @Post(':id/resume')
  async resume(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.service.resume(user.sub, id);
  }

  // ─── GET /requests/:id/matches ───────────────────────────────

  @Get(':id/matches')
  async getMatches(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('minScore') minScore?: string,
    @Query('sort') sort?: 'score' | 'date',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getMatches(user.sub, id, {
      minScore: minScore ? parseFloat(minScore) : undefined,
      sort,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  // ─── POST /requests/:id/recompute ────────────────────────────

  @Post(':id/recompute')
  async recompute(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.service.recompute(user.sub, id);
  }
}

// ─── matches.controller functionality exposed as nested route ───
// PATCH /matches/:id lives in a dedicated controller to keep routes clean.

@Controller('matches')
@UseGuards(JwtAuthGuard)
export class MatchesController {
  constructor(private readonly service: RequestsService) {}

  @Patch(':id')
  async updateMatch(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMatchDto,
  ) {
    return this.service.updateMatch(user.sub, id, dto);
  }
}

// ─── seller reverse view ────────────────────────────────────────
// GET /properties/:id/interested-requests
// Lives on its own route namespace so it can sit beside /properties.

@Controller('properties')
@UseGuards(JwtAuthGuard)
export class InterestedRequestsController {
  constructor(private readonly service: RequestsService) {}

  @Get(':id/interested-requests')
  async list(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.service.interestedRequestsForProperty(user.sub, id);
  }
}
