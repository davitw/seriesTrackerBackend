import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CatalogSeriesDetail } from './tmdb.adapter';

export interface CachedSeries {
  id: string;
  externalId: number;
  title: string;
  originalTitle: string | null;
  firstAirDate: Date | null;
  overview: string | null;
  posterPath: string | null;
  status: string | null;
}

/**
 * Escrita e leitura do catálogo global.
 *
 * Recebe a transação como parâmetro em vez de injetar o cliente: o catálogo é dado
 * global (sem RLS), mas precisa participar da mesma transação da requisição para que
 * adicionar uma série e vinculá-la ao perfil sejam uma operação só.
 */
@Injectable()
export class CatalogRepository {
  async cacheSeries(
    tx: Prisma.TransactionClient,
    detail: CatalogSeriesDetail,
  ): Promise<string> {
    const series = await tx.series.upsert({
      where: { externalId: detail.externalId },
      create: {
        externalId: detail.externalId,
        title: detail.title,
        originalTitle: detail.originalTitle,
        firstAirDate: detail.firstAirDate ? new Date(detail.firstAirDate) : null,
        overview: detail.overview,
        posterPath: detail.posterPath,
        status: detail.status,
        syncedAt: new Date(),
      },
      update: {
        title: detail.title,
        originalTitle: detail.originalTitle,
        firstAirDate: detail.firstAirDate ? new Date(detail.firstAirDate) : null,
        overview: detail.overview,
        posterPath: detail.posterPath,
        status: detail.status,
        syncedAt: new Date(),
      },
    });

    for (const season of detail.seasons) {
      const seasonRow = await tx.season.upsert({
        where: {
          seriesId_seasonNumber: { seriesId: series.id, seasonNumber: season.seasonNumber },
        },
        create: {
          seriesId: series.id,
          seasonNumber: season.seasonNumber,
          name: season.name,
          airDate: season.airDate ? new Date(season.airDate) : null,
          episodeCount: season.episodeCount,
          posterPath: season.posterPath,
        },
        update: {
          name: season.name,
          airDate: season.airDate ? new Date(season.airDate) : null,
          episodeCount: season.episodeCount,
          posterPath: season.posterPath,
        },
      });

      for (const episode of season.episodes) {
        await tx.episode.upsert({
          where: {
            seriesId_seasonNumber_episodeNumber: {
              seriesId: series.id,
              seasonNumber: episode.seasonNumber,
              episodeNumber: episode.episodeNumber,
            },
          },
          create: {
            seriesId: series.id,
            seasonId: seasonRow.id,
            seasonNumber: episode.seasonNumber,
            episodeNumber: episode.episodeNumber,
            title: episode.title,
            overview: episode.overview,
            airDate: episode.airDate ? new Date(episode.airDate) : null,
            runtime: episode.runtime,
            stillPath: episode.stillPath,
          },
          update: {
            title: episode.title,
            overview: episode.overview,
            airDate: episode.airDate ? new Date(episode.airDate) : null,
            runtime: episode.runtime,
            stillPath: episode.stillPath,
          },
        });
      }
    }

    return series.id;
  }

  async findByExternalId(
    tx: Prisma.TransactionClient,
    externalId: number,
  ): Promise<CachedSeries | null> {
    const series = await tx.series.findUnique({ where: { externalId } });
    return series ? (series as CachedSeries) : null;
  }

  async findById(tx: Prisma.TransactionClient, seriesId: string): Promise<CachedSeries | null> {
    const series = await tx.series.findUnique({ where: { id: seriesId } });
    return series ? (series as CachedSeries) : null;
  }
}
