import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const FAVORITE_PROPERTY_SELECT = {
  id: true,
  title: true,
  description: true,
  price: true,
  type: true,
  propertyKind: true,
  bedrooms: true,
  bathrooms: true,
  areaM2: true,
  governorate: true,
  city: true,
  district: true,
  street: true,
  nearestLandmark: true,
  propertyStatus: true,
  createdAt: true,
  adTitle: true,
  adDescription: true,
  media: {
    select: { id: true, url: true, type: true },
    take: 6,
  },
} as const;

@Injectable()
export class FavoritesService {
  private readonly logger = new Logger(FavoritesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Add a property to the user's favorites (upsert-safe).
   */
  async add(userId: string, propertyId: string) {
    this.logger.debug(`add favorite — user=${userId}, property=${propertyId}`);
    return this.prisma.favorite.upsert({
      where: {
        userId_propertyId: { userId, propertyId },
      },
      create: { userId, propertyId },
      update: {},
    });
  }

  /**
   * Remove a property from the user's favorites.
   */
  async remove(userId: string, propertyId: string) {
    this.logger.debug(
      `remove favorite — user=${userId}, property=${propertyId}`,
    );
    return this.prisma.favorite.deleteMany({
      where: { userId, propertyId },
    });
  }

  /**
   * List user's favorite properties with full property data.
   */
  async findAll(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        property: {
          select: FAVORITE_PROPERTY_SELECT,
        },
      },
    });
    return {
      data: favorites.map((f) => f.property),
      meta: { total: favorites.length },
    };
  }

  /**
   * Return just the property IDs the user has favorited
   * (for fast heart icon state on listing page).
   */
  async findIds(userId: string): Promise<string[]> {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      select: { propertyId: true },
    });
    return favorites.map((f) => f.propertyId);
  }
}
