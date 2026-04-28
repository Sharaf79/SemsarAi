import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ChatHistoryItemDto {
  @IsIn(['user', 'assistant'])
  readonly role: 'user' | 'assistant';

  @IsString()
  @IsNotEmpty()
  readonly content: string;
}

export class ChatDto {
  @IsUUID('4')
  readonly negotiationId: string;

  @IsString()
  @MinLength(1)
  readonly userMessage: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryItemDto)
  readonly history?: ChatHistoryItemDto[];
}
