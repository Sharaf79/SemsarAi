import {
  Controller,
  Get,
  Query,
  Logger,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import { LocationsService } from './locations.service';

@Controller('locations')
export class LocationsController {
  private readonly logger = new Logger(LocationsController.name);

  constructor(private readonly locationsService: LocationsService) {}

  /**
   * L12: GET /locations/governorates
   * Returns all active governorates sorted by sort_order.
   */
  @Get('governorates')
  async getGovernorates() {
    this.logger.debug('GET /locations/governorates');
    const governorates = await this.locationsService.getGovernorates();
    return { governorates };
  }

  /**
   * L13: GET /locations/cities?governorateId={id}
   * Returns all active cities under the given governorate.
   */
  @Get('cities')
  async getCities(
    @Query('governorateId', ParseIntPipe) governorateId: number,
  ) {
    this.logger.debug(`GET /locations/cities?governorateId=${governorateId}`);
    const cities = await this.locationsService.getCities(governorateId);
    return { cities };
  }

  /**
   * L14: GET /locations/districts?cityId={id}
   * Returns all active districts under the given city.
   */
  @Get('districts')
  async getDistricts(@Query('cityId', ParseIntPipe) cityId: number) {
    this.logger.debug(`GET /locations/districts?cityId=${cityId}`);
    const districts = await this.locationsService.getDistricts(cityId);
    return { districts };
  }
}
