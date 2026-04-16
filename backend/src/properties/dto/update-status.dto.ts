import { IsEnum } from 'class-validator';
import { PropertyStatus } from '@prisma/client';

export class UpdatePropertyStatusDto {
  @IsEnum(PropertyStatus, {
    message: 'الحالة يجب أن تكون ACTIVE أو INACTIVE أو SOLD أو RENTED',
  })
  status: PropertyStatus;
}
