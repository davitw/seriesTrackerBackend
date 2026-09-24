import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Clock } from '../common/clock/clock';
import { episodeNotFound, seriesNotInProfile } from '../common/errors/error-codes';
import { LibraryRepository } from '../library/library.repository';
import { UserScope } from '../database/user-scope';
import { EpisodeAvailabilityService } from './episode-availability.service';
import { ProgressCalculator, SeasonProgress } from './progress.calculator';
import { TrackingRepository } from './tracking.repository';

export interface EpisodeProgressView {
  episodeId: string;
  seasonNumber: number;
  episodeNumber: number;
  watched: boolean;
  watchedAt: string | null;
  airDate: string | null;
  seasonProgress: SeasonProgress;
}

const toIsoDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

@Injectable()
export class TrackingService {
  constructor(
    private readonly scope: UserScope,
    private readonly repository: TrackingRepository,
    private readonly libraryRepository: LibraryRepository,
    private readonly availability: EpisodeAvailabilityService,
    private readonly clock: Clock,
  ) {}

  async markWatched(seriesId: string, episodeId: string): Promise<EpisodeProgressView> {
    const { userId, tx } = this.scoped();
    await this.assertInProfile(tx, userId, seriesId);

    const episode = await this.repository.findEpisode(tx, seriesId, episodeId);
    if (!episode) throw episodeNotFound();

    // Recusa antes de escrever: episódio não liberado não vira progresso.
    this.availability.assertCanBeMarked(episode.airDate);

    const now = this.clock.now();
    await this.repository.markWatched(tx, userId, episodeId, now);
    // A ordenação das "acessadas recentemente" é consequência da marcação, na mesma
    // transação — não um campo que outra rota mantém (FR-008, Princípio IV).
    await this.libraryRepository.touchLastWatched(tx, userId, seriesId, now);

    const record = await this.repository.findWatched(tx, userId, episodeId);

    return {
      episodeId,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      watched: true,
      watchedAt: record?.watchedAt.toISOString() ?? null,
      airDate: toIsoDate(episode.airDate),
      seasonProgress: await this.seasonProgress(tx, seriesId, episode.seasonNumber),
    };
  }

  async unmarkWatched(seriesId: string, episodeId: string): Promise<void> {
    const { userId, tx } = this.scoped();
    await this.assertInProfile(tx, userId, seriesId);

    const episode = await this.repository.findEpisode(tx, seriesId, episodeId);
    if (!episode) throw episodeNotFound();

    await this.repository.unmarkWatched(tx, userId, episodeId);
  }

  private async assertInProfile(
    tx: Prisma.TransactionClient,
    userId: string,
    seriesId: string,
  ): Promise<void> {
    const link = await tx.userSeries.findFirst({ where: { userId, seriesId }, select: { id: true } });
    // Série fora do perfil e série de outra pessoa têm a mesma resposta (FR-016).
    if (!link) throw seriesNotInProfile();
  }

  private async seasonProgress(
    tx: Prisma.TransactionClient,
    seriesId: string,
    seasonNumber: number,
  ): Promise<SeasonProgress> {
    const episodes = await tx.episode.findMany({
      where: { seriesId, seasonNumber },
      select: { id: true, seasonNumber: true, episodeNumber: true, airDate: true },
    });
    const watched = await tx.userEpisodeProgress.findMany({
      where: { userId: this.scope.userId, episode: { seriesId, seasonNumber } },
      select: { episodeId: true },
    });
    const watchedIds = new Set(watched.map((row) => row.episodeId));
    // A marcação é por identificador de episódio; a calculadora trabalha com
    // "temporada:episódio" — a tradução acontece aqui, uma vez só.
    const watchedKeys = new Set(
      episodes
        .filter((episode) => watchedIds.has(episode.id))
        .map((episode) => `${episode.seasonNumber}:${episode.episodeNumber}`),
    );

    const calculator = new ProgressCalculator(this.clock.today());
    return calculator.forSeason(
      seasonNumber,
      episodes.map((episode) => ({
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        airDate: toIsoDate(episode.airDate),
      })),
      watchedKeys,
    );
  }

  private scoped(): { userId: string; tx: Prisma.TransactionClient } {
    return { userId: this.scope.userId, tx: this.scope.client };
  }
}
