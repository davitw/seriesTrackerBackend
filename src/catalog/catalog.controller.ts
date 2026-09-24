import { Controller, Get, Query, UseGuards, ValidationError } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ErrorResponseDto } from '../common/errors/error-response.dto';
import { validationExceptionFactory } from '../common/errors/validation';
import { CatalogService } from './catalog.service';
import { CatalogSearchResponseDto } from './dto/catalog.response';
import { searchQuerySchema } from './dto/search-query.dto';
import { CatalogSeriesSummary } from './tmdb.adapter';

@ApiTags('catalog')
@ApiBearerAuth()
@Controller('catalog')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('series/search')
  @ApiOperation({
    summary: 'Buscar séries no catálogo externo',
    description:
      'É a única operação que depende de consulta nova ao provedor externo — e, por isso, a ' +
      'única que pode falhar por indisponibilidade dele. As demais continuam funcionando com ' +
      'os dados já guardados.',
  })
  @ApiQuery({
    name: 'query',
    required: true,
    type: String,
    description: 'Trecho do título. Mínimo de 2 caracteres.',
    example: 'breaking',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Máximo de correspondências (1 a 20). Padrão: 10.',
    example: 10,
  })
  @ApiResponse({
    status: 200,
    description: 'Correspondências encontradas. A lista pode ser vazia.',
    type: CatalogSearchResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Sessão ausente, inválida ou expirada (`UNAUTHENTICATED`).',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 422,
    description: 'Termo de busca inválido (`VALIDATION_ERROR`).',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 503,
    description:
      'Catálogo externo indisponível e o dado não está em cache (`CATALOG_UNAVAILABLE`).',
    type: ErrorResponseDto,
  })
  async search(
    @Query('query') query: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: CatalogSeriesSummary[] }> {
    const parsed = searchQuerySchema.safeParse({ query, limit });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw validationExceptionFactory([
        {
          property: issue.path.join('.') || 'query',
          constraints: { invalid: issue.message },
        } as ValidationError,
      ]);
    }

    const items = await this.catalog.search(parsed.data.query, parsed.data.limit);
    return { items };
  }
}
