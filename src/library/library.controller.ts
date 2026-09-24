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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { validationExceptionFactory } from '../common/errors/validation';
import { AddSeriesDto } from './dto/add-series.dto';
import { listQuerySchema } from './dto/list-query.dto';
import { LibraryService, ProfileSeries, SeriesDetailView } from './library.service';

@ApiTags('library')
@ApiBearerAuth()
@Controller('series')
@UseGuards(JwtAuthGuard)
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  @ApiOperation({ summary: 'Listar as séries do meu perfil' })
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ items: ProfileSeries[]; total: number }> {
    const parsed = listQuerySchema.safeParse({ limit, offset });
    if (!parsed.success) {
      throw validationExceptionFactory([
        {
          property: parsed.error.issues[0]!.path.join('.'),
          constraints: { invalid: parsed.error.issues[0]!.message },
        } as ValidationError,
      ]);
    }
    return this.library.listSeries(parsed.data.limit, parsed.data.offset);
  }

  @Post()
  @ApiOperation({ summary: 'Adicionar uma série ao meu perfil' })
  async add(
    @Body() dto: AddSeriesDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ProfileSeries> {
    const added = await this.library.addSeries(dto.externalId);
    // 201 na primeira vez, 200 quando a série já estava no perfil (FR-007).
    response.status(added.alreadyInProfile ? HttpStatus.OK : HttpStatus.CREATED);
    return added;
  }

  @Get(':seriesId')
  @ApiOperation({ summary: 'Detalhes da série com episódios e progresso' })
  detail(
    @Param('seriesId', new ParseUUIDPipe()) seriesId: string,
  ): Promise<SeriesDetailView> {
    return this.library.getSeriesDetail(seriesId);
  }

  @Delete(':seriesId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover uma série do meu perfil' })
  async remove(@Param('seriesId', new ParseUUIDPipe()) seriesId: string): Promise<void> {
    await this.library.removeSeries(seriesId);
  }
}
