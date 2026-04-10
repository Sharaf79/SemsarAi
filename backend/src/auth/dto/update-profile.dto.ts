import { IsString, IsNotEmpty, IsEmail, IsOptional, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(100, { message: 'name must be at most 100 characters' })
  readonly name: string;

  @IsEmail({}, { message: 'email must be a valid email address' })
  @IsOptional()
  readonly email?: string;
}
