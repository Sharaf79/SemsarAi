import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PropertyStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all properties with PENDING_REVIEW status
   */
  async getPendingProperties() {
    const properties = await this.prisma.property.findMany({
      where: {
        propertyStatus: PropertyStatus.PENDING_REVIEW,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        media: {
          take: 6,
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return properties;
  }

  /**
   * Get a single property by ID
   */
  async getPropertyById(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
        media: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    return property;
  }

  /**
   * Approve a property (change status to ACTIVE)
   */
  async approveProperty(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const updated = await this.prisma.property.update({
      where: { id },
      data: {
        propertyStatus: PropertyStatus.ACTIVE,
      },
    });

    return {
      success: true,
      message: 'Property approved successfully',
      property: updated,
    };
  }

  /**
   * Reject a property (change status to INACTIVE)
   */
  async rejectProperty(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const updated = await this.prisma.property.update({
      where: { id },
      data: {
        propertyStatus: PropertyStatus.INACTIVE,
      },
    });

    return {
      success: true,
      message: 'Property rejected successfully',
      property: updated,
    };
  }
}
