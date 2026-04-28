import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  ValidateIf,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { Type } from 'class-transformer';

function IsNotPlaceholderInProduction(
  placeholders: string[],
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isNotPlaceholderInProduction',
      target: object.constructor,
      propertyName,
      constraints: [placeholders],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const env = args.object as EnvironmentVariables;
          if (env.NODE_ENV !== 'production') {
            return true;
          }

          if (typeof value !== 'string') {
            return false;
          }

          const disallowed = args.constraints[0] as string[];
          return !disallowed.includes(value.trim());
        },
      },
    });
  };
}

/**
 * Environment variable validation.
 *
 * WhatsApp vars are **required** in production (`NODE_ENV=production`)
 * but optional in development so the app can start without real credentials.
 */
export class EnvironmentVariables {
  // ─── Core (always required) ──────────────────────────────

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  @IsNotPlaceholderInProduction(['your_gemini_api_key_here'], {
    message: 'GEMINI_API_KEY must be replaced with a real production value',
  })
  GEMINI_API_KEY!: string;

  @IsString()
  @IsNotEmpty()
  @IsNotPlaceholderInProduction(['your_jwt_secret_here'], {
    message: 'JWT_SECRET must be replaced with a real production value',
  })
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN?: string;

  // ─── WhatsApp Cloud API ──────────────────────────────────
  // Required in production, optional in development.

  @ValidateIf((o: EnvironmentVariables) => o.NODE_ENV === 'production')
  @IsString()
  @IsNotEmpty({ message: 'WHATSAPP_TOKEN is required in production' })
  @IsNotPlaceholderInProduction(['your_whatsapp_token_here'], {
    message: 'WHATSAPP_TOKEN must be replaced with a real production value',
  })
  WHATSAPP_TOKEN?: string;

  @ValidateIf((o: EnvironmentVariables) => o.NODE_ENV === 'production')
  @IsString()
  @IsNotEmpty({ message: 'WHATSAPP_PHONE_NUMBER_ID is required in production' })
  @IsNotPlaceholderInProduction(['your_phone_number_id_here'], {
    message: 'WHATSAPP_PHONE_NUMBER_ID must be replaced with a real production value',
  })
  WHATSAPP_PHONE_NUMBER_ID?: string;

  @ValidateIf((o: EnvironmentVariables) => o.NODE_ENV === 'production')
  @IsString()
  @IsNotEmpty({ message: 'WHATSAPP_APP_SECRET is required in production' })
  @IsNotPlaceholderInProduction(['your_app_secret_here'], {
    message: 'WHATSAPP_APP_SECRET must be replaced with a real production value',
  })
  WHATSAPP_APP_SECRET?: string;

  @ValidateIf((o: EnvironmentVariables) => o.NODE_ENV === 'production')
  @IsString()
  @IsNotEmpty({ message: 'WHATSAPP_VERIFY_TOKEN is required in production' })
  @IsNotPlaceholderInProduction(['your_verify_token_here'], {
    message: 'WHATSAPP_VERIFY_TOKEN must be replaced with a real production value',
  })
  WHATSAPP_VERIFY_TOKEN?: string;

  // ─── WhatsApp OTP Template Config ────────────────────────

  @IsString()
  @IsOptional()
  WHATSAPP_OTP_TEMPLATE_NAME?: string;

  @IsString()
  @IsOptional()
  WHATSAPP_OTP_TEMPLATE_LANG?: string;

  @IsString()
  @IsOptional()
  WHATSAPP_BUSINESS_ACCOUNT_ID?: string;

  // ─── SMS Fallback (optional) ─────────────────────────────

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  SMS_FALLBACK_ENABLED?: boolean;

  @IsString()
  @IsOptional()
  SMS_PROVIDER?: string;

  @IsString()
  @IsOptional()
  TWILIO_ACCOUNT_SID?: string;

  @IsString()
  @IsOptional()
  TWILIO_AUTH_TOKEN?: string;

  @IsString()
  @IsOptional()
  TWILIO_PHONE_NUMBER?: string;

  // ─── App ─────────────────────────────────────────────────

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  PORT?: number;

  @IsString()
  @IsOptional()
  NODE_ENV?: string;

  @IsString()
  @IsOptional()
  GEMINI_MODEL?: string;

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  // ─── LLM Provider ────────────────────────────────────────

  @IsString()
  @IsOptional()
  LLM_PROVIDER?: string;

  @IsString()
  @IsOptional()
  OLLAMA_BASE_URL?: string;

  @IsString()
  @IsOptional()
  OLLAMA_MODEL?: string;

  // ─── Buyer Requests (spec 006) ───────────────────────────

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  BUYER_REQUESTS_ENABLED?: boolean;

  @IsString()
  @IsOptional()
  INTERNAL_WEBHOOK_SECRET?: string;
}
