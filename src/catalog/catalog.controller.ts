import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CatalogService } from './catalog.service';
import { CatalogSeriesSummary } from './tmdb.adapter';
import { searchQuerySchema } from './dto/search-query.dto';
import { validationExceptionFactory } from '../common/errors/validation';
import { ValidationError } from '@nestjs/common';

@ApiTags('catalog')
@ApiBearerAuth()
@Controller('catalog')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('series/search')
  @ApiQuery({ name: 'query', required: true })
  @ApiOperation({ summary: 'Buscar séries no catálogo externo' })
  async search(
    @Query('query') query: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: CatalogSeriesSummary[] }> {
    const parsed = searchQuerySchema.safeParse({ query, limit });
    if (!parsed.success) {
      throw validationExceptionFactory([
        { property: parsed.error.issues[0]!.path.join('.'), constraints: { invalid: parsed.error.issues[0]!.message } } as ValidationError,
      ]);
    }

    const items = await this.catalog.search(parsed.data.query, parsed.data.limit);
    return { items };
  }
}
