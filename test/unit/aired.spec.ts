import { Clock, FixedClock } from '../../src/common/clock/clock';
import { ProgressCalculator } from '../../src/tracking/progress.calculator';

/** T053 — regra de liberação dependente de tempo, com relógio controlado (FR-013). */
describe('Regra de episódio liberado', () => {
  const clock: Clock = new FixedClock(new Date('2026-09-23T12:00:00.000Z'));

  it('usa UTC como referência de calendário', () => {
    expect(clock.today()).toBe('2026-09-23');
  });

  it('a data de hoje já conta como liberada', () => {
    expect(clock.isAired('2026-09-23')).toBe(true);
  });

  it('data no passado está liberada', () => {
    expect(clock.isAired('2008-01-20')).toBe(true);
  });

  it('data no futuro não está liberada', () => {
    expect(clock.isAired('2026-09-24')).toBe(false);
  });

  it('data ausente conta como não liberada — não se marca o que não se conhece', () => {
    expect(clock.isAired(null)).toBe(false);
    expect(clock.isAired(undefined)).toBe(false);
  });

  it('o cálculo de progresso usa a mesma regra do relógio', () => {
    const calculator = new ProgressCalculator(clock.today());
    const progress = calculator.forSeason(
      1,
      [
        { seasonNumber: 1, episodeNumber: 1, airDate: '2026-09-22' },
        { seasonNumber: 1, episodeNumber: 2, airDate: '2026-09-23' },
        { seasonNumber: 1, episodeNumber: 3, airDate: '2026-09-24' },
      ],
      new Set(),
    );

    expect(progress.airedEpisodes).toBe(2);
    expect(progress.notAired).toBe(1);
  });
});
