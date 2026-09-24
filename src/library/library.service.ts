import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Clock } from '../common/clock/clock';
import { seriesNotInProfile } from '../common/errors/error-codes';
import { CatalogRepository } from '../catalog/catalog.repository';
import { CatalogService } from '../catalog/catalog.service';
import { ProgressCalculator, SeasonProgress } from '../tracking/progress.calculator';
import { UserScope } from '../database/user-scope';
import { LibraryRepository } from './library.repository';

export interface ProfileSeries {
  id: string;
  externalId: number;
  title: string;
  posterPath: string | null;
  addedAt: string;
  lastWatchedAt: string | null;
  overall: SeasonProgress;
  seasons: SeasonProgress[];
  alreadyInProfile?: boolean;
}

export interface EpisodeView {
  episodeId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  airDate: string | null;
  watched: boolean;
  watchedAt: string | null;
}

export interface SeasonView {
  seasonNumber: number;
  name: string | null;
  airDate: string | null;
  progress: SeasonProgress;
  episodes: EpisodeView[];
}

export interface SeriesDetailView {
  id: string;
  externalId: number;
  title: string;
  overview: string | null;
  posterPath: string | null;
  status: string | null;
  addedAt: string;
  lastWatchedAt: string | null;
  overall: SeasonProgress;
  seasons: SeasonView[];
}

const toIsoDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

@Injectable()
export class LibraryService {
  constructor(
    private readonly scope: UserScope,
    private readonly catalog: CatalogService,
    private readonly catalogRepository: CatalogRepository,
    private readonly repository: LibraryRepository,
    private readonly clock: Clock,
  ) {}

  async addSeries(externalId: number): Promise<ProfileSeries> {
    const { userId, tx } = this.scoped();

    const seriesId = await this.catalog.ensureCached(tx, externalId);
    const created = await this.repository.linkSeries(tx, userId, seriesId);
    const link = await this.repository.findLink(tx, userId, seriesId);
    const series = await this.catalogRepository.findById(tx, seriesId);

    const progress = await this.progressFor(tx, userId, seriesId);

    return {
      id: seriesId,
      externalId,
      title: series!.title,
      posterPath: series!.posterPath,
      addedAt: link!.addedAt.toISOString(),
      lastWatchedAt: link!.lastWatchedAt?.toISOString() ?? null,
      overall: progress.overall,
      seasons: progress.seasons,
      alreadyInProfile: !created,
    };
  }

  async listSeries(limit: number, offset: number): Promise<{ items: ProfileSeries[]; total: number }> {
    const { userId, tx } = this.scoped();

    const links = await this.repository.listLinks(tx, userId, limit, offset);
    const total = await this.repository.countLinks(tx, userId);

    const items = await Promise.all(
      links.map(async (link) => {
        const series = await this.catalogRepository.findById(tx, link.seriesId);
        const progress = await this.progressFor(tx, userId, link.seriesId);
        return {
          id: link.seriesId,
          externalId: series!.externalId,
          title: series!.title,
          posterPath: series!.posterPath,
          addedAt: link.addedAt.toISOString(),
          lastWatchedAt: link.lastWatchedAt?.toISOString() ?? null,
          overall: progress.overall,
          seasons: progress.seasons,
        };
      }),
    );

    return { items, total };
  }

  async removeSeries(seriesId: string): Promise<void> {
    const { userId, tx } = this.scoped();
    const removed = await this.repository.removeLink(tx, userId, seriesId);
    if (!removed) throw seriesNotInProfile();
  }

  async getSeriesDetail(seriesId: string): Promise<SeriesDetailView> {
    const { userId, tx } = this.scoped();

    const link = await this.repository.findLink(tx, userId, seriesId);
    // Sem vínculo, a série é indistinguível de inexistente — inclusive quando pertence
    // a outra pessoa (FR-016).
    if (!link) throw seriesNotInProfile();

    const series = await this.catalogRepository.findById(tx, seriesId);
    const episodes = await tx.episode.findMany({
      where: { seriesId },
      orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
    });
    const watched = await tx.userEpisodeProgress.findMany({
      where: { userId, episode: { seriesId } },
      select: { episodeId: true, watchedAt: true },
    });
    const watchedById = new Map(watched.map((row) => [row.episodeId, row.watchedAt]));

    const calculator = new ProgressCalculator(this.clock.today());
    const seasonNumbers = [...new Set(episodes.map((episode) => episode.seasonNumber))].sort(
      (a, b) => a - b,
    );
    const seasonsRows = await tx.season.findMany({ where: { seriesId } });

    const watchedKeys = new Set(
      episodes
        .filter((episode) => watchedById.has(episode.id))
        .map((episode) => `${episode.seasonNumber}:${episode.episodeNumber}`),
    );

    const seasons: SeasonView[] = seasonNumbers.map((seasonNumber) => {
      const seasonEpisodes = episodes.filter((episode) => episode.seasonNumber === seasonNumber);
      const progress = calculator.forSeason(
        seasonNumber,
        seasonEpisodes.map((episode) => ({
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          airDate: toIsoDate(episode.airDate),
        })),
        watchedKeys,
      );

      return {
        seasonNumber,
        name: seasonsRows.find((row) => row.seasonNumber === seasonNumber)?.name ?? null,
        airDate: toIsoDate(
          seasonsRows.find((row) => row.seasonNumber === seasonNumber)?.airDate ?? null,
        ),
        progress,
        episodes: seasonEpisodes.map((episode) => ({
          episodeId: episode.id,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          title: episode.title,
          airDate: toIsoDate(episode.airDate),
          watched: watchedById.has(episode.id),
          watchedAt: watchedById.get(episode.id)?.toISOString() ?? null,
        })),
      };
    });

    return {
      id: seriesId,
      externalId: series!.externalId,
      title: series!.title,
      overview: series!.overview,
      posterPath: series!.posterPath,
      status: series!.status,
      addedAt: link.addedAt.toISOString(),
      lastWatchedAt: link.lastWatchedAt?.toISOString() ?? null,
      overall: calculator.overall(seasons.map((season) => season.progress)),
      seasons,
    };
  }

  private async progressFor(
    tx: Prisma.TransactionClient,
    userId: string,
    seriesId: string,
  ): Promise<{ seasons: SeasonProgress[]; overall: SeasonProgress }> {
    const episodes = await tx.episode.findMany({
      where: { seriesId },
      orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
      select: { id: true, seasonNumber: true, episodeNumber: true, airDate: true },
    });

    const watched = await tx.userEpisodeProgress.findMany({
      where: { userId, episode: { seriesId } },
      select: { episodeId: true },
    });
    const watchedIds = new Set(watched.map((row) => row.episodeId));
    const watchedKeys = new Set(
      episodes
        .filter((episode) => watchedIds.has(episode.id))
        .map((episode) => `${episode.seasonNumber}:${episode.episodeNumber}`),
    );

    const calculator = new ProgressCalculator(this.clock.today());
    const seasonNumbers = [...new Set(episodes.map((episode) => episode.seasonNumber))].sort(
      (a, b) => a - b,
    );

    const seasons = seasonNumbers.map((seasonNumber) =>
      calculator.forSeason(
        seasonNumber,
        episodes
          .filter((episode) => episode.seasonNumber === seasonNumber)
          .map((episode) => ({
            seasonNumber: episode.seasonNumber,
            episodeNumber: episode.episodeNumber,
            airDate: toIsoDate(episode.airDate),
          })),
        watchedKeys,
      ),
    );

    return { seasons, overall: calculator.overall(seasons) };
  }

  private scoped(): { userId: string; tx: Prisma.TransactionClient } {
    return { userId: this.scope.userId, tx: this.scope.client };
  }
}
