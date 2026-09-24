/** Porta do cliente HTTP do catálogo externo. */
export const CATALOG_HTTP_CLIENT = Symbol('CATALOG_HTTP_CLIENT');

export interface CatalogHttpClient {
  getJson<T>(path: string, params?: Record<string, string | number>): Promise<T>;
}
