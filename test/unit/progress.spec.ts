import { ProgressCalculator } from '../../src/tracking/progress.calculator';

/** T052 — derivação de progresso e o invariante de SC-004. */
describe('ProgressCalculator', () => {
  const calculator = new ProgressCalculator('2026-09-23');
  const episodes = [
    { seasonNumber: 1, episodeNumber: 1, airDate: '2008-01-20' },
    { seasonNumber: 1, episodeNumber: 2, airDate: '2008-01-27' },
    { seasonNumber: 1, episodeNumber: 3, airDate: null },
    { seasonNumber: 1, episodeNumber: 4, airDate: '2099-01-01' },
  ];

  it('separa liberados de não liberados', () => {
    const progress = calculator.forSeason(1, episodes, new Set());

    expect(progress.totalEpisodes).toBe(4);
    expect(progress.airedEpisodes).toBe(2);
    expect(progress.notAired).toBe(2);
  });

  it('conta apenas marcações de episódios liberados', () => {
    const progress = calculator.forSeason(1, episodes, new Set(['1:1']));

    expect(progress.watchedEpisodes).toBe(1);
    expect(progress.remainingAired).toBe(1);
  });

  it('ignora marcação de episódio que não foi liberado', () => {
    const progress = calculator.forSeason(1, episodes, new Set(['1:4']));
    expect(progress.watchedEpisodes).toBe(0);
  });

  it('mantém assistidos + faltantes = liberados em qualquer combinação', () => {
    for (const watched of [new Set<string>(), new Set(['1:1']), new Set(['1:1', '1:2'])]) {
      const progress = calculator.forSeason(1, episodes, watched);
      expect(progress.watchedEpisodes + progress.remainingAired).toBe(progress.airedEpisodes);
    }
  });

  it('aponta o próximo episódio a liberar pela menor data futura', () => {
    const progress = calculator.forSeason(1, episodes, new Set());
    expect(progress.nextEpisodeNumber).toBe(4);
    expect(progress.nextAirDate).toBe('2099-01-01');
  });

  it('não aponta próximo episódio quando tudo já foi liberado', () => {
    const progress = calculator.forSeason(
      1,
      episodes.filter((episode) => episode.airDate !== null && episode.airDate < '2026-09-23'),
      new Set(),
    );
    expect(progress.nextEpisodeNumber).toBeNull();
    expect(progress.nextAirDate).toBeNull();
  });

  it('soma as temporadas no total da série', () => {
    const season1 = calculator.forSeason(1, episodes, new Set(['1:1']));
    const season2 = calculator.forSeason(
      2,
      [{ seasonNumber: 2, episodeNumber: 1, airDate: '2009-03-08' }],
      new Set(),
    );

    const overall = calculator.overall([season1, season2]);

    expect(overall.airedEpisodes).toBe(3);
    expect(overall.watchedEpisodes).toBe(1);
    expect(overall.remainingAired).toBe(2);
    expect(overall.watchedEpisodes + overall.remainingAired).toBe(overall.airedEpisodes);
  });
});
