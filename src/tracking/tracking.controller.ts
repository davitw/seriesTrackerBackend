import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ErrorResponseDto } from '../common/errors/error-response.dto';
import { EpisodeProgressDto } from '../library/dto/library.response';
import { EpisodeProgressView, TrackingService } from './tracking.service';

@ApiTags('tracking')
@ApiBearerAuth()
@Controller('series')
@UseGuards(JwtAuthGuard)
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Put(':seriesId/episodes/:episodeId/watched')
  @ApiOperation({
    summary: 'Marcar episódio como assistido',
    description:
      'Idempotente: repetir a operação preserva o instante da primeira marcação. Episódio com ' +
      'estreia no futuro — ou sem data conhecida — é recusado com a data na resposta.',
  })
  @ApiParam({ name: 'seriesId', format: 'uuid', description: 'Série do seu perfil.' })
  @ApiParam({
    name: 'episodeId',
    format: 'uuid',
    description: 'Episódio daquela série, obtido em `GET /v1/series/{seriesId}`.',
  })
  @ApiResponse({
    status: 200,
    description: 'Episódio marcado. O progresso da temporada já vem atualizado.',
    type: EpisodeProgressDto,
  })
  @ApiResponse({ status: 401, description: 'Sessão inválida.', type: ErrorResponseDto })
  @ApiResponse({
    status: 404,
    description:
      'Série fora do seu perfil (`SERIES_NOT_IN_PROFILE`) ou episódio que não pertence a ela ' +
      '(`EPISODE_NOT_FOUND`).',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 422,
    description:
      'Episódio ainda não liberado (`EPISODE_NOT_AIRED`). `details.airDate` traz a data de ' +
      'estreia, ou `null` quando ela é desconhecida.',
    type: ErrorResponseDto,
  })
  mark(
    @Param('seriesId', new ParseUUIDPipe()) seriesId: string,
    @Param('episodeId', new ParseUUIDPipe()) episodeId: string,
  ): Promise<EpisodeProgressView> {
    return this.tracking.markWatched(seriesId, episodeId);
  }

  @Delete(':seriesId/episodes/:episodeId/watched')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Desmarcar episódio assistido',
    description: 'Idempotente: desmarcar um episódio que não estava marcado também responde 204.',
  })
  @ApiParam({ name: 'seriesId', format: 'uuid' })
  @ApiParam({ name: 'episodeId', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Episódio desmarcado.' })
  @ApiResponse({ status: 401, description: 'Sessão inválida.', type: ErrorResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Série fora do seu perfil ou episódio que não pertence a ela.',
    type: ErrorResponseDto,
  })
  async unmark(
    @Param('seriesId', new ParseUUIDPipe()) seriesId: string,
    @Param('episodeId', new ParseUUIDPipe()) episodeId: string,
  ): Promise<void> {
    await this.tracking.unmarkWatched(seriesId, episodeId);
  }
}
