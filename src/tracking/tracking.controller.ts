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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EpisodeProgressView, TrackingService } from './tracking.service';

@ApiTags('tracking')
@ApiBearerAuth()
@Controller('series')
@UseGuards(JwtAuthGuard)
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Put(':seriesId/episodes/:episodeId/watched')
  @ApiOperation({ summary: 'Marcar episódio como assistido' })
  mark(
    @Param('seriesId', new ParseUUIDPipe()) seriesId: string,
    @Param('episodeId', new ParseUUIDPipe()) episodeId: string,
  ): Promise<EpisodeProgressView> {
    return this.tracking.markWatched(seriesId, episodeId);
  }

  @Delete(':seriesId/episodes/:episodeId/watched')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desmarcar episódio assistido' })
  async unmark(
    @Param('seriesId', new ParseUUIDPipe()) seriesId: string,
    @Param('episodeId', new ParseUUIDPipe()) episodeId: string,
  ): Promise<void> {
    await this.tracking.unmarkWatched(seriesId, episodeId);
  }
}
