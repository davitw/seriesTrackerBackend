import { TmdbAdapter } from '../../src/catalog/tmdb.adapter';
import { FixtureHttpClient } from '../helpers/catalog-fixtures';

/** T009 — mapeamento da lista de destaques (R-005, FR-002, FR-004). */
describe('TmdbAdapter.getList', () => {
  it('mapeia a lista para o resumo interno', async () => {
    const adapter = new TmdbAdapter(new FixtureHttpClient());

    const items = await adapter.getList('popular');

    expect(items[0]).toEqual({
      externalId: 1396,
      title: 'Breaking Bad',
      firstAirDate: '2008-01-20',
      overview: 'Um professor de química vira fabricante de metanfetamina.',
      posterPath: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
    });
  });

  it('preserva a ordem devolvida pelo provedor, sem reordenar', async () => {
    const adapter = new TmdbAdapter(new FixtureHttpClient());

    const items = await adapter.getList('popular');

    expect(items.map((item) => item.title)).toEqual([
      'Breaking Bad',
      'The Last of Us',
      'Succession',
    ]);
  });

  it('respeita o limite pedido', async () => {
    const adapter = new TmdbAdapter(new FixtureHttpClient());
    const items = await adapter.getList('popular', 2);
    expect(items).toHaveLength(2);
  });

  it('devolve lista vazia quando o provedor não tem destaques, sem erro', async () => {
    const adapter = new TmdbAdapter({
      getJson: () => Promise.resolve({ results: [] }),
    } as never);

    await expect(adapter.getList('popular')).resolves.toEqual([]);
  });

  it('recusa resposta sem o envelope esperado', async () => {
    const adapter = new TmdbAdapter({ getJson: () => Promise.resolve({}) } as never);
    await expect(adapter.getList('popular')).rejects.toThrow();
  });

  it('recusa item com tipo inesperado em vez de propagar lixo', async () => {
    const adapter = new TmdbAdapter({
      getJson: () => Promise.resolve({ results: [{ id: 'não-é-número', name: 42 }] }),
    } as never);

    await expect(adapter.getList('popular')).rejects.toThrow();
  });

  it('trata campo ausente como nulo, sem inventar valor', async () => {
    const adapter = new TmdbAdapter({
      getJson: () =>
        Promise.resolve({
          results: [{ id: 1, name: 'Série sem metadados', first_air_date: null }],
        }),
    } as never);

    const [item] = await adapter.getList('popular');

    expect(item).toEqual({
      externalId: 1,
      title: 'Série sem metadados',
      firstAirDate: null,
      overview: null,
      posterPath: null,
    });
  });
});
