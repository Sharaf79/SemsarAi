/**
 * Backfill script — synthesize NegotiationMessage rows from existing Offer + AiLog data.
 *
 * Usage:
 *   npx ts-node src/scripts/backfill-negotiation-messages.ts           # dry-run (default)
 *   npx ts-node src/scripts/backfill-negotiation-messages.ts --apply   # persist to DB
 *
 * The script is idempotent: it checks for existing messages before inserting.
 */

import { PrismaClient, AiActionType, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

interface RowCount {
  negotiationId: string;
  offers: number;
  aiLogs: number;
  totalExpected: number;
}

async function main() {
  console.log(`\n🔄 Backfill NegotiationMessages — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  // 1. Load all negotiations
  const negotiations = await prisma.negotiation.findMany({
    select: {
      id: true,
      buyerId: true,
      sellerId: true,
      currentOffer: true,
      createdAt: true,
    },
  });

  console.log(`Found ${negotiations.length} negotiations\n`);

  const counts: RowCount[] = [];

  for (const neg of negotiations) {
    // Load offers for this negotiation
    const offers = await prisma.offer.findMany({
      where: { negotiationId: neg.id },
      orderBy: { createdAt: 'asc' },
    });

    // Load aiLogs for this negotiation
    const aiLogs = await prisma.aiLog.findMany({
      where: { negotiationId: neg.id },
      orderBy: { createdAt: 'asc' },
    });

    // Build set of already-backfilled (source, sourceId) pairs so re-runs are idempotent.
    const existing = await prisma.negotiationMessage.findMany({
      where: {
        negotiationId: neg.id,
        meta: { not: Prisma.JsonNull },
      },
      select: { meta: true },
    });
    const seenSources = new Set<string>();
    for (const row of existing) {
      const meta = row.meta as { source?: string; sourceId?: string } | null;
      if (meta?.source && meta.sourceId) {
        seenSources.add(`${meta.source}:${meta.sourceId}`);
      }
    }

    const totalExpected = offers.length + aiLogs.length;
    const remaining =
      offers.filter((o) => !seenSources.has(`Offer:${o.id}`)).length +
      aiLogs.filter((l) => !seenSources.has(`AiLog:${l.id}`)).length;

    counts.push({
      negotiationId: neg.id,
      offers: offers.length,
      aiLogs: aiLogs.length,
      totalExpected,
    });

    if (!APPLY) {
      console.log(
        `  [dry] neg=${neg.id.slice(0, 8)}…  offers=${offers.length}  aiLogs=${aiLogs.length}  alreadyBackfilled=${seenSources.size}  toCreate=${remaining}`,
      );
      continue;
    }

    // ─── Apply mode: create message rows ────────────────────────
    const messagesToCreate: Array<{
      negotiationId: string;
      senderRole: string;
      senderUserId: string | null;
      body: string;
      kind: string;
      meta: Record<string, unknown> | null;
      createdAt: Date;
      sourceKey: string;
    }> = [];

    // Convert offers to messages
    for (const offer of offers) {
      const createdBy = (offer as { createdBy?: string }).createdBy ?? 'SYSTEM';
      let senderRole = 'SYSTEM';
      let senderUserId: string | null = null;

      if (createdBy === 'BUYER') {
        senderRole = 'BUYER';
        senderUserId = neg.buyerId;
      } else if (createdBy === 'SELLER') {
        senderRole = 'SELLER';
        senderUserId = neg.sellerId;
      } else {
        senderRole = 'AI';
      }

      messagesToCreate.push({
        negotiationId: neg.id,
        senderRole,
        senderUserId,
        body: `عرض ${Number(offer.amount).toLocaleString('ar-EG')} ج.م`,
        kind: 'OFFER',
        meta: { amount: Number(offer.amount), round: offer.round, source: 'Offer', sourceId: offer.id },
        createdAt: offer.createdAt,
        sourceKey: `Offer:${offer.id}`,
      });
    }

    // Convert aiLogs to messages
    for (const log of aiLogs) {
      let kind = 'TEXT';
      let senderRole = 'AI';

      switch (log.actionType) {
        case AiActionType.ACCEPT:
          kind = 'ACTION';
          break;
        case AiActionType.REJECT:
          kind = 'ACTION';
          break;
        case AiActionType.COUNTER:
          kind = 'OFFER';
          break;
        case AiActionType.ASK:
        default:
          kind = 'TEXT';
          break;
      }

      messagesToCreate.push({
        negotiationId: neg.id,
        senderRole,
        senderUserId: null,
        body: log.message ?? '(no message)',
        kind,
        meta: { actionType: log.actionType, source: 'AiLog', sourceId: log.id },
        createdAt: log.createdAt,
        sourceKey: `AiLog:${log.id}`,
      });
    }

    // Idempotent filter: only create rows whose (source, sourceId) hasn't been backfilled yet.
    const toCreate = messagesToCreate.filter((m) => !seenSources.has(m.sourceKey));
    if (toCreate.length === 0) {
      console.log(`  [skip] neg=${neg.id.slice(0, 8)}… already fully backfilled`);
      continue;
    }

    for (const msg of toCreate) {
      await prisma.negotiationMessage.create({
        data: {
          negotiationId: msg.negotiationId,
          senderRole: msg.senderRole as 'BUYER' | 'SELLER' | 'AI' | 'SYSTEM',
          senderUserId: msg.senderUserId,
          body: msg.body,
          kind: msg.kind as 'TEXT' | 'OFFER' | 'ACTION' | 'NOTICE',
          meta: msg.meta ? (msg.meta as Prisma.InputJsonValue) : undefined,
          createdAt: msg.createdAt,
        },
      });
    }

    console.log(
      `  [ok]   neg=${neg.id.slice(0, 8)}… created ${toCreate.length} messages`,
    );
  }

  // ─── Summary ─────────────────────────────────────────────────
  console.log('\n── Summary ──────────────────────────────');
  const totalOffers = counts.reduce((s, c) => s + c.offers, 0);
  const totalAiLogs = counts.reduce((s, c) => s + c.aiLogs, 0);
  const totalExpected = counts.reduce((s, c) => s + c.totalExpected, 0);
  console.log(`Negotiations: ${negotiations.length}`);
  console.log(`Offers total: ${totalOffers}`);
  console.log(`AiLogs total: ${totalAiLogs}`);
  console.log(`Messages expected: ${totalExpected}`);
  if (!APPLY) {
    console.log('\n⚠️  This was a dry-run. Pass --apply to persist rows.');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
