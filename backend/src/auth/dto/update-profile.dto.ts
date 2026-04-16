import { IsString, IsNotEmpty, IsEmail, IsOptional, MaxLength, IsDateString } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(100, { message: 'name must be at most 100 characters' })
  readonly name: string;

  @IsEmail({}, { message: 'email must be a valid email address' })
  @IsOptional()
  readonly email?: string;

  @IsOptional()
  @IsDateString({}, { message: 'dateOfBirth must be a valid ISO date string' })
  readonly dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'sexType must be at most 20 characters' })
  readonly sexType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'notes must be at most 2000 characters' })
  readonly notes?: string;
}
