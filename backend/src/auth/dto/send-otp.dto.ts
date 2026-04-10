import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class SendOtpDto {
  /** Egyptian mobile number: 01x-xxxxxxxx (with/without country code) */
  @IsString()
  @IsNotEmpty({ message: 'phone is required' })
  @Matches(/^(\+20|0)?1[0125]\d{8}$/, {
    message: 'Invalid phone number — must be a valid Egyptian mobile number',
  })
  readonly phone: string;
}
