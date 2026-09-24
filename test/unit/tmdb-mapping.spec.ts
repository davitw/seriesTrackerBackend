import { TmdbAdapter } from '../../src/catalog/tmdb.adapter';
import { FixtureHttpClient } from '../helpers/catalog-fixtures';

/** T040 — mapeamento e validação do provedor externo (FR-006, Princípio II). */
describe('TmdbAdapter', () => {
  it('mapeia a busca para o modelo interno', async () => {
    const adapter = new TmdbAdapter(new FixtureHttpClient());

    const items = await adapter.searchSeries('breaking');

    expect(items).toEqual([
      {
        externalId: 1396,
        title: 'Breaking Bad',
        firstAirDate: '2008-01-20',
        overview: 'Um professor de química vira fabricante de metanfetamina.',
        posterPath: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
      },
    ]);
  });

  it('devolve lista vazia quando não há correspondência', async () => {
    const adapter = new TmdbAdapter(new FixtureHttpClient());
    await expect(adapter.searchSeries('título inexistente')).resolves.toEqual([]);
  });

  it('mapeia detalhes com temporadas e episódios', async () => {
    const adapter = new TmdbAdapter(new FixtureHttpClient());

    const detail = await adapter.getSeriesDetail(1396);

    expect(detail.externalId).toBe(1396);
    expect(detail.title).toBe('Breaking Bad');
    expect(detail.status).toBe('Ended');
    expect(detail.seasons).toHaveLength(2);
    expect(detail.seasons[0]?.seasonNumber).toBe(1);
    expect(detail.seasons[0]?.episodes).toHaveLength(3);
    expect(detail.seasons[0]?.episodes[0]?.title).toBe('Pilot');
    expect(detail.seasons[0]?.episodes[0]?.airDate).toBe('2008-01-20');
  });

  it('preserva data de estreia ausente como nula, sem inventar valor', async () => {
    const adapter = new TmdbAdapter(new FixtureHttpClient());

    const detail = await adapter.getSeriesDetail(1396);
    const semData = detail.seasons[1]?.episodes.find((e) => e.episodeNumber === 3);

    expect(semData?.airDate).toBeNull();
  });

  it('recusa resposta com tipo inesperado em vez de propagar lixo', async () => {
    const adapter = new TmdbAdapter({
      getJson: () => Promise.resolve({ results: [{ id: 'não-é-número', name: 42 }] }),
    } as never);

    await expect(adapter.searchSeries('qualquer')).rejects.toThrow();
  });

  it('recusa resposta sem os campos obrigatórios', async () => {
    const adapter = new TmdbAdapter({
      getJson: () => Promise.resolve({}),
    } as never);

    await expect(adapter.searchSeries('qualquer')).rejects.toThrow();
  });
});
