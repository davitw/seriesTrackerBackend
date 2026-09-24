import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Dublê do cliente HTTP do catálogo.
 *
 * Lê fixtures versionadas em vez de tocar a rede: os testes precisam ser determinísticos
 * e não podem depender da disponibilidade de um serviço de terceiros (Princípio II).
 */
export interface CatalogRequest {
  path: string;
  params?: Record<string, string | number>;
}

const FIXTURES = join(__dirname, '..', 'fixtures', 'tmdb');

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as unknown;
}

export function fixtureSearchResults(): unknown {
  return fixture('search-results.json');
}

export function fixtureSeries(externalId: number): unknown {
  return fixture(`series-${externalId}.json`);
}

export function fixtureSeason(seasonNumber: number): unknown {
  return fixture(`season-${seasonNumber}.json`);
}

export class FixtureHttpClient {
  readonly calls: CatalogRequest[] = [];
  private failEverything = false;

  failWith(): void {
    this.failEverything = true;
  }

  getJson<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    this.calls.push({ path, params });

    if (this.failEverything) {
      return Promise.reject(new Error('catálogo indisponível (dublê)'));
    }

    if (path === '/search/tv') {
      const query = String(params?.query ?? '').toLowerCase();
      const results = fixtureSearchResults() as { results: { name: string }[] };
      const matches = results.results.filter((item) => query.includes('breaking') && item.name === 'Breaking Bad');
      return Promise.resolve({ ...results, results: matches } as T);
    }

    if (path === '/tv/1396') return Promise.resolve(fixtureSeries(1396) as T);
    if (path === '/tv/1396/season/1') return Promise.resolve(fixtureSeason(1) as T);
    if (path === '/tv/1396/season/2') return Promise.resolve(fixtureSeason(2) as T);

    return Promise.reject(new Error(`fixture ausente para ${path}`));
  }
}
