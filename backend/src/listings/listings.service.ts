/**
 * Listings service — Prisma-based CRUD replacing Supabase.
 * Ported from Python src/services/supabase_service.py (listing methods).
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Listing, Intent, UnitType, ListingStatus } from '@prisma/client';

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getById(id: string): Promise<Listing | null> {
    return this.prisma.listing.findUnique({ where: { id } });
  }

  async getLatestByWhatsappId(whatsappId: string): Promise<Listing | null> {
    return this.prisma.listing.findFirst({
      where: { whatsappId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: {
    whatsappId: string;
    intent?: Intent | null;
    unitType?: UnitType | null;
    specs?: Record<string, unknown>;
    location?: string | null;
    price?: number | null;
    mediaUrls?: string[];
    status?: ListingStatus;
  }): Promise<Listing> {
    return this.prisma.listing.create({
      data: {
        whatsappId: data.whatsappId,
        intent: data.intent,
        unitType: data.unitType,
        specs: (data.specs as object) ?? undefined,
        location: data.location,
        price: data.price,
        mediaUrls: data.mediaUrls ?? [],
        status: data.status ?? ListingStatus.DRAFT,
      },
    });
  }

  async update(
    id: string,
    data: {
      intent?: Intent | null;
      unitType?: UnitType | null;
      specs?: Record<string, unknown>;
      location?: string | null;
      price?: number | null;
      mediaUrls?: string[];
      status?: ListingStatus;
    },
  ): Promise<Listing> {
    return this.prisma.listing.update({
      where: { id },
      data: {
        intent: data.intent,
        unitType: data.unitType,
        specs: (data.specs as object) ?? undefined,
        location: data.location,
        price: data.price,
        mediaUrls: data.mediaUrls,
        status: data.status,
      },
    });
  }

  /**
   * Publish a CONFIRMED SELL/RENT listing to the units table.
   */
  async publishUnit(listing: {
    id: string;
    whatsappId: string;
    intent: Intent;
    unitType: UnitType;
    specs: Record<string, unknown> | null;
    location: string | null;
    price: number | null;
    mediaUrls: string[];
  }): Promise<void> {
    await this.prisma.unit.create({
      data: {
        listingId: listing.id,
        whatsappId: listing.whatsappId,
        intent: listing.intent,
        unitType: listing.unitType,
        specs: (listing.specs as object) ?? undefined,
        location: listing.location,
        price: listing.price,
        mediaUrls: listing.mediaUrls,
        isActive: true,
      },
    });
  }
}
