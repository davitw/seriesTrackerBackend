import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
  ValidationError,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ErrorResponseDto } from '../common/errors/error-response.dto';
import { validationExceptionFactory } from '../common/errors/validation';
import { AddSeriesDto } from './dto/add-series.dto';
import {
  ProfileSeriesDto,
  ProfileSeriesListDto,
  SeriesDetailDto,
} from './dto/library.response';
import { listQuerySchema } from './dto/list-query.dto';
import { LibraryService, ProfileSeries, SeriesDetailView } from './library.service';

@ApiTags('library')
@ApiBearerAuth()
@Controller('series')
@UseGuards(JwtAuthGuard)
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar as séries do meu perfil',
    description:
      'Ordenadas pelas acessadas mais recentemente — as últimas 5 saem no topo. Cada item traz ' +
      'o progresso derivado no momento da leitura.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Máximo de itens (1 a 100). Padrão: 50.',
    example: 50,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Itens a pular, para paginação. Padrão: 0.',
    example: 0,
  })
  @ApiResponse({ status: 200, description: 'Perfil do usuário.', type: ProfileSeriesListDto })
  @ApiResponse({ status: 401, description: 'Sessão inválida.', type: ErrorResponseDto })
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ items: ProfileSeries[]; total: number }> {
    const parsed = listQuerySchema.safeParse({ limit, offset });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw validationExceptionFactory([
        {
          property: issue.path.join('.') || 'limit',
          constraints: { invalid: issue.message },
        } as ValidationError,
      ]);
    }
    return this.library.listSeries(parsed.data.limit, parsed.data.offset);
  }

  @Post()
  @ApiOperation({
    summary: 'Adicionar uma série ao meu perfil',
    description:
      'Idempotente: se a série já está no perfil, responde `200` com `alreadyInProfile: true` ' +
      'em vez de `201`, sem criar duplicata e sem apagar o progresso existente.',
  })
  @ApiResponse({
    status: 201,
    description: 'Série adicionada ao perfil.',
    type: ProfileSeriesDto,
  })
  @ApiResponse({
    status: 200,
    description: 'A série já estava no perfil — nada foi alterado.',
    type: ProfileSeriesDto,
  })
  @ApiResponse({ status: 401, description: 'Sessão inválida.', type: ErrorResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Série não existe no catálogo (`SERIES_NOT_FOUND`).',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: 422, description: 'Dados inválidos.', type: ErrorResponseDto })
  @ApiResponse({
    status: 503,
    description: 'Catálogo externo indisponível e a série ainda não está em cache.',
    type: ErrorResponseDto,
  })
  async add(
    @Body() dto: AddSeriesDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProfileSeries> {
    const added = await this.library.addSeries(dto.externalId);
    response.status(added.alreadyInProfile ? HttpStatus.OK : HttpStatus.CREATED);
    return added;
  }

  @Get(':seriesId')
  @ApiOperation({
    summary: 'Detalhes da série com episódios e progresso',
    description:
      'Episódios agrupados por temporada e em ordem, com o estado de assistido de cada um, o ' +
      'progresso da temporada e a data da próxima liberação. Funciona com o provedor externo ' +
      'fora do ar, desde que a série já esteja em cache.',
  })
  @ApiResponse({ status: 200, description: 'Detalhes da série.', type: SeriesDetailDto })
  @ApiResponse({ status: 401, description: 'Sessão inválida.', type: ErrorResponseDto })
  @ApiResponse({
    status: 404,
    description:
      'Série fora do seu perfil (`SERIES_NOT_IN_PROFILE`). É também a resposta quando a série ' +
      'pertence a outra conta — os dois casos são indistinguíveis de propósito.',
    type: ErrorResponseDto,
  })
  detail(
    @Param('seriesId', new ParseUUIDPipe()) seriesId: string,
  ): Promise<SeriesDetailView> {
    return this.library.getSeriesDetail(seriesId);
  }

  @Delete(':seriesId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remover uma série do meu perfil',
    description:
      'Remove o vínculo e descarta o progresso desta série para esta pessoa, na mesma ' +
      'operação. Readicionar depois começa do zero.',
  })
  @ApiResponse({ status: 204, description: 'Série removida do perfil.' })
  @ApiResponse({ status: 401, description: 'Sessão inválida.', type: ErrorResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Série fora do seu perfil (`SERIES_NOT_IN_PROFILE`).',
    type: ErrorResponseDto,
  })
  async remove(@Param('seriesId', new ParseUUIDPipe()) seriesId: string): Promise<void> {
    await this.library.removeSeries(seriesId);
  }
}
