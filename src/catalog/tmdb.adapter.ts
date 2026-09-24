import { Inject, Injectable, Logger } from '@nestjs/common';
import { CATALOG_HTTP_CLIENT, CatalogHttpClient } from './catalog.tokens';
import {
  seasonDetailSchema,
  searchResponseSchema,
  seriesDetailSchema,
} from './tmdb.schemas';

export interface CatalogSeriesSummary {
  externalId: number;
  title: string;
  firstAirDate: string | null;
  overview: string | null;
  posterPath: string | null;
}

export interface CatalogEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  overview: string | null;
  airDate: string | null;
  runtime: number | null;
  stillPath: string | null;
}

export interface CatalogSeason {
  seasonNumber: number;
  name: string | null;
  airDate: string | null;
  episodeCount: number | null;
  posterPath: string | null;
  episodes: CatalogEpisode[];
}

export interface CatalogSeriesDetail {
  externalId: number;
  title: string;
  originalTitle: string | null;
  firstAirDate: string | null;
  overview: string | null;
  posterPath: string | null;
  status: string | null;
  seasons: CatalogSeason[];
}

/** Resposta do provedor fora do contrato esperado. */
export class CatalogPayloadError extends Error {
  constructor(detail: string) {
    super(`Resposta inválida do catálogo externo: ${detail}`);
    this.name = 'CatalogPayloadError';
  }
}

/**
 * Única fronteira HTTP com o provedor externo.
 *
 * Nenhum outro ponto do código fala com o catálogo: é isso que torna o Princípio II
 * verificável em vez de aspiracional.
 */
@Injectable()
export class TmdbAdapter {
  private readonly logger = new Logger(TmdbAdapter.name);

  constructor(@Inject(CATALOG_HTTP_CLIENT) private readonly http: CatalogHttpClient) {}

  async searchSeries(query: string, limit = 10): Promise<CatalogSeriesSummary[]> {
    const raw = await this.http.getJson('/search/tv', { query, language: 'pt-BR' });
    const parsed = searchResponseSchema.safeParse(raw);

    if (!parsed.success) {
      throw new CatalogPayloadError(parsed.error.issues.map((i) => i.path.join('.')).join(', '));
    }

    return parsed.data.results.slice(0, limit).map((item) => ({
      externalId: item.id,
      title: item.name,
      firstAirDate: item.first_air_date ?? null,
      overview: item.overview ?? null,
      posterPath: item.poster_path ?? null,
    }));
  }

  async getSeriesDetail(externalId: number): Promise<CatalogSeriesDetail> {
    const raw = await this.http.getJson(`/tv/${externalId}`, { language: 'pt-BR' });
    const parsed = seriesDetailSchema.safeParse(raw);

    if (!parsed.success) {
      throw new CatalogPayloadError(parsed.error.issues.map((i) => i.path.join('.')).join(', '));
    }

    const detail = parsed.data;
    // Temporada 0 costuma reunir especiais; não entra no acompanhamento.
    const usableSeasons = detail.seasons.filter((season) => season.season_number > 0);

    const seasons = await Promise.all(
      usableSeasons.map(async (season) => {
        const seasonRaw = await this.http.getJson(`/tv/${externalId}/season/${season.season_number}`, {
          language: 'pt-BR',
        });
        const seasonParsed = seasonDetailSchema.safeParse(seasonRaw);
        if (!seasonParsed.success) {
          throw new CatalogPayloadError(
            `temporada ${season.season_number}: ${seasonParsed.error.issues
              .map((i) => i.path.join('.'))
              .join(', ')}`,
          );
        }

        return {
          seasonNumber: season.season_number,
          name: season.name ?? null,
          airDate: season.air_date ?? null,
          episodeCount: season.episode_count ?? null,
          posterPath: season.poster_path ?? null,
          episodes: seasonParsed.data.episodes.map((episode) => ({
            seasonNumber: season.season_number,
            episodeNumber: episode.episode_number,
            title: episode.name ?? null,
            overview: episode.overview ?? null,
            airDate: episode.air_date ?? null,
            runtime: episode.runtime ?? null,
            stillPath: episode.still_path ?? null,
          })),
        } satisfies CatalogSeason;
      }),
    );

    return {
      externalId: detail.id,
      title: detail.name,
      originalTitle: detail.original_name ?? null,
      firstAirDate: detail.first_air_date ?? null,
      overview: detail.overview ?? null,
      posterPath: detail.poster_path ?? null,
      status: detail.status ?? null,
      seasons,
    };
  }
}
