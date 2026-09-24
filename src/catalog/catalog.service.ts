import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { catalogUnavailable } from '../common/errors/error-codes';
import { CatalogRepository } from './catalog.repository';
import { CatalogSeriesSummary, TmdbAdapter } from './tmdb.adapter';

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly adapter: TmdbAdapter,
    private readonly repository: CatalogRepository,
  ) {}

  /**
   * Busca no catálogo externo.
   *
   * Falha do provedor vira `CATALOG_UNAVAILABLE`: a busca é a única operação que depende
   * de consulta nova, e é a única que pode falhar por causa do provedor (FR-018).
   */
  async search(query: string, limit: number): Promise<CatalogSeriesSummary[]> {
    try {
      return await this.adapter.searchSeries(query, limit);
    } catch (error) {
      this.logger.warn(`Busca no catálogo falhou: ${(error as Error).message}`);
      throw catalogUnavailable();
    }
  }

  /**
   * Garante que a série está em cache local e devolve o identificador interno.
   *
   * Leitura local primeiro: séries já acompanhadas continuam utilizáveis com o provedor
   * fora do ar. Só quem nunca foi carregado depende do catálogo externo.
   */
  async ensureCached(tx: Prisma.TransactionClient, externalId: number): Promise<string> {
    const cached = await this.repository.findByExternalId(tx, externalId);
    if (cached) return cached.id;

    try {
      const detail = await this.adapter.getSeriesDetail(externalId);
      return await this.repository.cacheSeries(tx, detail);
    } catch (error) {
      this.logger.warn(
        `Carga da série ${externalId} falhou: ${(error as Error).message}`,
      );
      throw catalogUnavailable();
    }
  }
}
