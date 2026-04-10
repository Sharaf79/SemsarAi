import { IsUUID, IsNotEmpty, IsEnum, IsUrl } from 'class-validator';
import { MediaType } from '@prisma/client';

export class UploadMediaDto {
  @IsNotEmpty({ message: 'userId is required' })
  @IsUUID('4', { message: 'userId must be a valid UUID v4' })
  readonly userId: string;

  /**
   * Publicly accessible URL of the uploaded file.
   * Must be an absolute HTTP or HTTPS URL with a valid TLD.
   */
  @IsNotEmpty({ message: 'url is required' })
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true, require_tld: false },
    { message: 'url must be a valid HTTP or HTTPS URL' },
  )
  readonly url: string;

  /**
   * Media file type — determines how the asset is rendered in listings.
   * Accepted values: IMAGE | VIDEO
   */
  @IsNotEmpty({ message: 'type is required' })
  @IsEnum(MediaType, {
    message: `type must be one of: ${Object.values(MediaType).join(', ')}`,
  })
  readonly type: MediaType;
}
