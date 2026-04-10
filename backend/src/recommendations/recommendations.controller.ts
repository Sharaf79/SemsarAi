import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RecommendationStatus } from '@prisma/client';

@Controller('recommendations')
@UseGuards(JwtAuthGuard)
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  /**
   * GET /recommendations?status=UNSEEN&page=1&limit=20
   * Returns paginated recommendations for the authenticated buyer.
   */
  @Get()
  async getRecommendations(
    @Req() req: { user: { sub: string } },
    @Query('status') status?: RecommendationStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.recommendationsService.getRecommendations(
      req.user.sub,
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * GET /recommendations/unseen-count
   * Returns the count of UNSEEN recommendations for the authenticated buyer.
   */
  @Get('unseen-count')
  async getUnseenCount(@Req() req: { user: { sub: string } }) {
    const count = await this.recommendationsService.getUnseenCount(
      req.user.sub,
    );
    return { count };
  }

  /**
   * PATCH /recommendations/:id/seen
   * Mark a recommendation as SEEN.
   */
  @Patch(':id/seen')
  async markSeen(
    @Req() req: { user: { sub: string } },
    @Param('id') id: string,
  ) {
    return this.recommendationsService.markSeen(id, req.user.sub);
  }

  /**
   * PATCH /recommendations/:id/dismiss
   * Mark a recommendation as DISMISSED.
   */
  @Patch(':id/dismiss')
  async dismiss(
    @Req() req: { user: { sub: string } },
    @Param('id') id: string,
  ) {
    return this.recommendationsService.dismiss(id, req.user.sub);
  }
}
