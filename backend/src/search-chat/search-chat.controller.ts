import { Body, Controller, Post, UseGuards, Request } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { SearchChatService, type HistoryEntry, type SearchFilters } from './search-chat.service';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

class HistoryEntryDto {
  @IsString() role!: 'user' | 'bot';
  @IsString() text!: string;
}

class SearchChatDto {
  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HistoryEntryDto)
  history?: HistoryEntry[];

  @IsOptional()
  @IsObject()
  previousFilters?: SearchFilters;
}

const ANON_SEARCH_USER = 'anon-search-user';

@Controller('search-chat')
@UseGuards(OptionalJwtAuthGuard)
export class SearchChatController {
  constructor(private readonly searchChat: SearchChatService) {}

  @Post('message')
  async handleMessage(
    @Request() req: { user?: { id: string } },
    @Body() body: SearchChatDto,
  ) {
    const userId = req.user?.id ?? body.userId ?? ANON_SEARCH_USER;
    return this.searchChat.handleMessage(
      userId,
      body.message,
      body.history ?? [],
      body.previousFilters,
    );
  }
}
