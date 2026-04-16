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
import { UpdatePropertyDto } from './dto';

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
  apartmentType: true,
  ownershipType: true,
  amenities: true,
  floorLevel: true,
  isFurnished: true,
  readiness: true,
  deliveryDate: true,
  deliveryTerms: true,
  finishingType: true,
  paymentMethod: true,
  paymentType: true,
  isNegotiable: true,
  rentRateType: true,
  // Resort/Seasonal property fields
  location: true,
  rentalRate: true,
  rentalFees: true,
  downPayment: true,
  insurance: true,
  adTitle: true,
  adDescription: true,
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

  // ─── GET /properties/:id ─────────────────────────────────────

  async findOne(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      select: PUBLIC_PROPERTY_SELECT,
    });
    
    if (!property) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    return property;
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

  // ─── GET /properties/mine ────────────────────────────────────

  async findMine(userId: string) {
    const data = await this.prisma.property.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { ...PUBLIC_PROPERTY_SELECT, userId: true },
    });
    return { data, meta: { total: data.length } };
  }

  // ─── PATCH /properties/:id/status ────────────────────────────

  async updateStatus(
    propertyId: string,
    userId: string,
    status: PropertyStatus,
  ) {
    const prop = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!prop) throw new NotFoundException(`Property ${propertyId} not found`);
    if (prop.userId !== userId)
      throw new ForbiddenException('لا يمكنك تعديل هذا العقار');

    return this.prisma.property.update({
      where: { id: propertyId },
      data: { propertyStatus: status },
    });
  }

  // ─── PATCH /properties/:id ───────────────────────────────────

  async update(propertyId: string, userId: string, dto: UpdatePropertyDto) {
    const prop = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!prop) throw new NotFoundException(`Property ${propertyId} not found`);
    if (prop.userId !== userId)
      throw new ForbiddenException('لا يمكنك تعديل هذا العقار');

    const updated = await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        ...(dto.adTitle !== undefined ? { adTitle: dto.adTitle } : {}),
        ...(dto.adDescription !== undefined
          ? { adDescription: dto.adDescription }
          : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.bedrooms !== undefined ? { bedrooms: dto.bedrooms } : {}),
        ...(dto.bathrooms !== undefined ? { bathrooms: dto.bathrooms } : {}),
        ...(dto.areaM2 !== undefined ? { areaM2: dto.areaM2 } : {}),
        ...(dto.governorate !== undefined
          ? { governorate: dto.governorate }
          : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.district !== undefined ? { district: dto.district } : {}),
        ...(dto.isNegotiable !== undefined
          ? { isNegotiable: dto.isNegotiable }
          : {}),
        ...(dto.propertyKind !== undefined
          ? { propertyKind: dto.propertyKind }
          : {}),
      },
      select: PUBLIC_PROPERTY_SELECT,
    });

    return updated;
  }

  // ─── DELETE /properties/:id ──────────────────────────────────

  async remove(propertyId: string, userId: string) {
    const prop = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!prop) throw new NotFoundException(`Property ${propertyId} not found`);
    if (prop.userId !== userId)
      throw new ForbiddenException('لا يمكنك حذف هذا العقار');

    return this.prisma.property.update({
      where: { id: propertyId },
      data: { propertyStatus: PropertyStatus.INACTIVE },
    });
  }

  // ─── Admin: Find by status ──────────────────────────────────

  async findByStatus(
    status: PropertyStatus,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;
    const where = { propertyStatus: status };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          ...PUBLIC_PROPERTY_SELECT,
          userId: true,
          user: {
            select: { phone: true, name: true },
          },
        },
      }),
      this.prisma.property.count({ where }),
    ]);

    return { data, meta: { page, limit, total } };
  }

  // ─── Admin: Update status (no owner check) ──────────────────

  async adminUpdateStatus(propertyId: string, status: PropertyStatus) {
    const prop = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!prop) throw new NotFoundException(`Property ${propertyId} not found`);

    return this.prisma.property.update({
      where: { id: propertyId },
      data: { propertyStatus: status },
      select: PUBLIC_PROPERTY_SELECT,
    });
  }
}
