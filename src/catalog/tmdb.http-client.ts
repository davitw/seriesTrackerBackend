import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogHttpClient } from './catalog.tokens';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Cliente HTTP real do provedor externo.
 *
 * Timeout curto de propósito: o catálogo é uma dependência de terceiros e uma espera
 * longa degradaria a experiência de quem só quer ver a própria lista (FR-018).
 * A credencial vem de variável de ambiente e nunca é registrada em log.
 */
@Injectable()
export class TmdbHttpClient implements CatalogHttpClient {
  constructor(private readonly config: ConfigService) {}

  async getJson<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const url = new URL(`${TMDB_BASE_URL}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, String(value));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          // A credencial é um Read Access Token (v4) e vai no cabeçalho `Authorization`.
          // Enviá-la como `?api_key=` (formato da API Key v3) devolve 401 — verificado
          // contra a API real. Ver `research.md` R-005.
          Authorization: `Bearer ${this.config.getOrThrow<string>('TMDB_API_KEY')}`,
        },
      });
      if (!response.ok) {
        throw new Error(`catálogo externo respondeu ${response.status}`);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
