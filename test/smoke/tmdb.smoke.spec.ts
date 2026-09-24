import { ConfigService } from '@nestjs/config';
import { TmdbAdapter } from '../../src/catalog/tmdb.adapter';
import { TmdbHttpClient } from '../../src/catalog/tmdb.http-client';
import { loadRootEnv } from '../helpers/db';

/**
 * Verificação de fumaça do provedor externo — **usa a rede de verdade**.
 *
 * Fica fora de `npm test` de propósito: a suíte padrão é determinística e não depende de
 * terceiros. Esta aqui existe para cobrir exatamente o que as fixtures substituem —
 * credencial válida, formato de autenticação correto e contrato do provedor.
 *
 * Rode com: `npm run test:smoke`
 */
describe('Fumaça do catálogo externo (rede real)', () => {
  let adapter: TmdbAdapter;

  beforeAll(() => {
    loadRootEnv();
    adapter = new TmdbAdapter(new TmdbHttpClient(new ConfigService()));
  });

  it('a credencial autentica no provedor', async () => {
    const items = await adapter.searchSeries('breaking bad', 5);

    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.externalId).toBeGreaterThan(0);
    expect(typeof items[0]?.title).toBe('string');
  });

  it('o contrato de detalhes segue o que o adapter espera', async () => {
    const detail = await adapter.getSeriesDetail(1396);

    expect(detail.externalId).toBe(1396);
    expect(typeof detail.title).toBe('string');
    expect(detail.seasons.length).toBeGreaterThan(0);

    const firstSeason = detail.seasons[0]!;
    expect(firstSeason.seasonNumber).toBeGreaterThan(0);
    expect(firstSeason.episodes.length).toBeGreaterThan(0);
    expect(firstSeason.episodes[0]?.episodeNumber).toBeGreaterThan(0);
  });

  it('devolve lista vazia, não erro, quando nada corresponde', async () => {
    const items = await adapter.searchSeries('zzzzzzzz-titulo-inexistente-zzzzzzzz');
    expect(items).toEqual([]);
  });
});
