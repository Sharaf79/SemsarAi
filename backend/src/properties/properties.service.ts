import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PropertyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { QueryPropertiesDto, SortOption } from './dto';

/** Safe property fields returned to the public — never includes phone / email */
const PUBLIC_PROPERTY_SELECT = {
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
  media: {
    select: { id: true, url: true, type: true },
    take: 6,
  },
} satisfies Prisma.PropertySelect;

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  // ─── GET /properties ─────────────────────────────────────────

  async findAll(query: QueryPropertiesDto): Promise<{
    data: Prisma.PropertyGetPayload<{ select: typeof PUBLIC_PROPERTY_SELECT }>[];
    meta: { page: number; limit: number; total: number };
  }> {
    const {
      minPrice,
      maxPrice,
      city,
      governorate,
      district,
      propertyType,
      propertyKind,
      bedrooms,
      sort,
      page = 1,
      limit = 20,
    } = query;

    // Build the Prisma where clause
    const where: Prisma.PropertyWhereInput = {
      propertyStatus: PropertyStatus.ACTIVE,
    };

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {
        ...(minPrice !== undefined ? { gte: minPrice } : {}),
        ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
      };
    }

    if (city) where.city = { contains: city };
    if (governorate) where.governorate = { contains: governorate };
    if (district) where.district = { contains: district };
    if (propertyType) where.type = propertyType;
    if (propertyKind) where.propertyKind = propertyKind;
    if (bedrooms !== undefined) where.bedrooms = bedrooms;

    // Sort
    let orderBy: Prisma.PropertyOrderByWithRelationInput;
    switch (sort) {
      case SortOption.PRICE_ASC:
        orderBy = { price: 'asc' };
        break;
      case SortOption.PRICE_DESC:
        orderBy = { price: 'desc' };
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    const skip = (page - 1) * limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: PUBLIC_PROPERTY_SELECT,
      }),
      this.prisma.property.count({ where }),
    ]);

    return { data, meta: { page, limit, total } };
  }

  // ─── GET /properties/:id/owner-contact ───────────────────────

  /**
   * Returns the property owner's phone number.
   * Only accessible if the requesting user has a COMPLETED payment
   * linked to a deal from a negotiation on this property.
   */
  async getOwnerContact(
    propertyId: string,
    userId: string,
  ): Promise<{ ownerPhone: string }> {
    // Verify property exists
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, userId: true },
    });

    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`);
    }

    // Check for COMPLETED payment via negotiation → deal chain
    const deal = await this.prisma.deal.findFirst({
      where: {
        buyerId: userId,
        negotiation: { propertyId },
      },
      select: { id: true },
    });

    if (!deal || !(await this.paymentsService.isPaymentCompleted(deal.id, userId))) {
      throw new ForbiddenException(
        'A completed payment is required to unlock the owner contact',
      );
    }

    // Safe to return — access has been verified
    const owner = await this.prisma.user.findUnique({
      where: { id: property.userId },
      select: { phone: true },
    });

    if (!owner) {
      throw new NotFoundException('Property owner account not found');
    }

    return { ownerPhone: owner.phone };
  }
}
