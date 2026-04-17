import { IsEnum } from 'class-validator';
import { MatchStatus } from '@prisma/client';

export class UpdateMatchDto {
  @IsEnum(MatchStatus)
  status!: MatchStatus;
}
