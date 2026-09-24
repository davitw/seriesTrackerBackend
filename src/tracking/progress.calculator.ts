export interface EpisodeForProgress {
  seasonNumber: number;
  episodeNumber: number;
  airDate: string | null;
}

export interface SeasonProgress {
  seasonNumber: number;
  totalEpisodes: number;
  airedEpisodes: number;
  watchedEpisodes: number;
  remainingAired: number;
  notAired: number;
  nextEpisodeNumber: number | null;
  nextAirDate: string | null;
}

/**
 * Derivação de progresso — função pura, sem armazenamento (Princípio IV).
 *
 * Nenhum contador é persistido: o progresso é sempre recalculado a partir do conjunto
 * atual de episódios e marcações. É isso que impede a divergência entre a lista de
 * episódios e o total exibido.
 */
export class ProgressCalculator {
  constructor(private readonly today: string) {}

  forSeason(
    seasonNumber: number,
    episodes: EpisodeForProgress[],
    watchedEpisodeKeys: ReadonlySet<string>,
  ): SeasonProgress {
    const doEpisodio = (episode: EpisodeForProgress) =>
      `${episode.seasonNumber}:${episode.episodeNumber}`;

    const aired = episodes.filter((episode) => this.isAired(episode.airDate));
    const notAired = episodes.filter((episode) => !this.isAired(episode.airDate));
    const watched = aired.filter((episode) => watchedEpisodeKeys.has(doEpisodio(episode)));

    const next = [...notAired]
      .filter((episode) => episode.airDate !== null)
      .sort((a, b) => (a.airDate! < b.airDate! ? -1 : 1))[0];

    return {
      seasonNumber,
      totalEpisodes: episodes.length,
      airedEpisodes: aired.length,
      watchedEpisodes: watched.length,
      remainingAired: aired.length - watched.length,
      notAired: notAired.length,
      nextEpisodeNumber: next?.episodeNumber ?? null,
      nextAirDate: next?.airDate ?? null,
    };
  }

  overall(seasons: SeasonProgress[]): SeasonProgress {
    return seasons.reduce<SeasonProgress>(
      (acc, season) => ({
        seasonNumber: 0,
        totalEpisodes: acc.totalEpisodes + season.totalEpisodes,
        airedEpisodes: acc.airedEpisodes + season.airedEpisodes,
        watchedEpisodes: acc.watchedEpisodes + season.watchedEpisodes,
        remainingAired: acc.remainingAired + season.remainingAired,
        notAired: acc.notAired + season.notAired,
        nextEpisodeNumber: acc.nextEpisodeNumber ?? season.nextEpisodeNumber,
        nextAirDate: acc.nextAirDate ?? season.nextAirDate,
      }),
      {
        seasonNumber: 0,
        totalEpisodes: 0,
        airedEpisodes: 0,
        watchedEpisodes: 0,
        remainingAired: 0,
        notAired: 0,
        nextEpisodeNumber: null,
        nextAirDate: null,
      },
    );
  }

  isAired(airDate: string | null): boolean {
    if (!airDate) return false;
    return airDate <= this.today;
  }
}
