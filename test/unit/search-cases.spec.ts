import { TmdbAdapter } from '../../src/catalog/tmdb.adapter';
import { FixtureHttpClient } from '../helpers/catalog-fixtures';
import searchCases from '../fixtures/tmdb/search-cases.json';

interface SearchCase {
  query: string;
  expectedTitles: string[];
  note: string;
}

/**
 * T069 — avaliação da busca por título (SC-005, parte que este serviço controla).
 *
 * SC-005 pede "95% das buscas retornam o título correto entre as 5 primeiras
 * correspondências". O **ranqueamento é do provedor externo** — este serviço não ordena
 * nem pontua resultados. O que está sob responsabilidade do backend, e é verificado
 * aqui, é não perder nem embaralhar a correspondência recebida, e não transformar
 * ausência de resultado em erro.
 */
describe('Avaliação da busca por título (SC-005 — parte do backend)', () => {
  const cases = searchCases as SearchCase[];

  it('preserva a correspondência devolvida pelo provedor em cada caso conhecido', async () => {
    const adapter = new TmdbAdapter(new FixtureHttpClient());

    for (const testCase of cases) {
      const items = await adapter.searchSeries(testCase.query);
      expect({ query: testCase.query, titles: items.map((item) => item.title) }).toEqual({
        query: testCase.query,
        titles: testCase.expectedTitles,
      });
    }
  });

  it('devolve lista vazia — não erro — quando nada corresponde', async () => {
    const adapter = new TmdbAdapter(new FixtureHttpClient());
    const items = await adapter.searchSeries('titulo que nao existe em lugar nenhum');
    expect(items).toEqual([]);
  });
});
