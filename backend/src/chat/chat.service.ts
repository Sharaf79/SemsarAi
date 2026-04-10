import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationEngineService } from '../conversation-engine/conversation-engine.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { ActiveFlow, ConversationContext, ConversationResponse } from '../common/types';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationEngine: ConversationEngineService,
    private readonly onboardingService: OnboardingService,
    private readonly recommendationsService: RecommendationsService,
  ) {}

  /**
   * Main entry-point for frontend chat.
   *
   * Flow detection order (when `flow` is not explicitly provided):
   *  1. Active negotiation  (status = ACTIVE, buyerId = userId)   → negotiation flow
   *  2. Incomplete draft    (isCompleted = false, userId = userId)  → onboarding flow
   *  3. Neither             → create/resume a draft                 → onboarding flow
   *
   * @param userId   Resolved user ID (from JWT or anonymous UUID)
   * @param message  User's text message
   * @param flow     Optional explicit flow override
   * @param entityId Optional explicit entity ID (draft / negotiation UUID)
   */
  async processMessage(
    userId: string,
    message: string,
    flow?: ActiveFlow,
    entityId?: string,
  ): Promise<ConversationResponse> {
    const context = await this.resolveContext(userId, flow, entityId);

    this.logger.debug(
      `Processing message — userId=${userId} flow=${context.activeFlow} entityId=${context.entityId}`,
    );

    const response = await this.conversationEngine.processMessage(context, message);

    // Enrich response with unseen recommendation count (non-blocking)
    try {
      const unseenCount = await this.recommendationsService.getUnseenCount(userId);
      if (unseenCount > 0) {
        response.unseenRecommendations = unseenCount;
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch unseen recommendations: ${err}`);
    }

    return response;
  }

  // ─── Private helpers ────────────────────────────────────────────

  private async resolveContext(
    userId: string,
    flow?: ActiveFlow,
    entityId?: string,
  ): Promise<ConversationContext> {
    // 1. Explicit override — caller knows exactly what they want.
    if (flow === 'negotiation') {
      const resolvedId = entityId ?? (await this.findActiveNegotiationId(userId));
      if (!resolvedId) {
        throw new BadRequestException(
          'No active negotiation found for this user.',
        );
      }
      return this.buildContext(userId, 'negotiation', resolvedId);
    }

    if (flow === 'onboarding') {
      const resolvedId = entityId ?? (await this.getOrCreateDraftId(userId));
      return this.buildContext(userId, 'onboarding', resolvedId);
    }

    // 2. Auto-detect: prefer negotiation over onboarding when both exist.
    const negotiationId = await this.findActiveNegotiationId(userId);
    if (negotiationId) {
      return this.buildContext(userId, 'negotiation', negotiationId);
    }

    // 3. Fall back to onboarding (creates a draft if none exists).
    const draftId = await this.getOrCreateDraftId(userId);
    return this.buildContext(userId, 'onboarding', draftId);
  }

  /** Returns the ID of the user's single ACTIVE negotiation (as buyer), or null. */
  private async findActiveNegotiationId(userId: string): Promise<string | null> {
    const neg = await this.prisma.negotiation.findFirst({
      where: { buyerId: userId, status: 'ACTIVE' },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    return neg?.id ?? null;
  }

  /**
   * Returns the ID of the user's most-recent incomplete draft.
   * If no draft exists, delegates to OnboardingService to create one.
   */
  private async getOrCreateDraftId(userId: string): Promise<string> {
    const draft = await this.prisma.propertyDraft.findFirst({
      where: { userId, isCompleted: false },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    if (draft) return draft.id;

    // Create a fresh draft via the onboarding service (idempotent).
    const newDraft = await this.onboardingService.startOrResumeDraft(userId);
    return newDraft.id;
  }

  private buildContext(
    userId: string,
    activeFlow: ActiveFlow,
    entityId: string,
  ): ConversationContext {
    return {
      userId,
      channel: 'app',
      activeFlow,
      entityId,
    };
  }
}
