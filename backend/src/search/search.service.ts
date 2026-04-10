/**
 * Search service — queries units table for buyer matching.
 * Ported from Python src/services/search_service.py with Prisma.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Unit, UnitType } from '@prisma/client';
import { ListingDto, UnitDto } from '../common/types';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search units matching a buyer's criteria.
   * Buy listings look for SELL intents.
   */
  async searchUnitsForBuyer(listing: ListingDto): Promise<Unit[]> {
    return this.prisma.unit.findMany({
      where: {
        isActive: true,
        intent: 'SELL',
        unitType: listing.unitType as UnitType | undefined,
        ...(listing.location
          ? { location: { contains: listing.location } }
          : {}),
        ...(listing.price ? { price: { lte: listing.price } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
  }

  /**
   * Format search results as Ammiya text.
   */
  formatSearchResults(units: UnitDto[]): string {
    if (units.length === 0) {
      return 'مفيش حاجة مطابقة لطلبك دلوقتي، بس سجلنا طلبك وهنبلغك أول ما يظهر حاجة مناسبة.';
    }

    const lines: string[] = ['لقينا العروض دي اللي ممكن تناسبك:'];
    units.forEach((u, i) => {
      let line = `${i + 1}. ${u.unitType} في ${u.location ?? 'مكان غير محدد'}`;
      if (u.price !== null && u.price !== undefined) {
        line += ` بسعر ${u.price} جنيه`;
      }
      const specs = (u.specs ?? {}) as Record<string, unknown>;
      if (specs['area']) {
        line += `، بمساحة ${specs['area']} متر`;
      }
      lines.push(line);
    });

    return lines.join('\n');
  }
}
