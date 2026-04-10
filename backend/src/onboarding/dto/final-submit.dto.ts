import { IsUUID, IsNotEmpty } from 'class-validator';

export class FinalSubmitDto {
  @IsNotEmpty({ message: 'userId is required' })
  @IsUUID('4', { message: 'userId must be a valid UUID v4' })
  readonly userId: string;
}
