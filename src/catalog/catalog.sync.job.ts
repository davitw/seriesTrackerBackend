import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { CatalogRepository } from './catalog.repository';
import { TmdbAdapter } from './tmdb.adapter';

const SYNC_TTL_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 50;

/**
 * Atualização periódica do catálogo (R-006).
 *
 * Sincroniza apenas metadados de séries já conhecidas, em lotes, e nunca falha o job
 * inteiro por causa de uma série: o produto continua servindo o cache enquanto isso.
 */
@Injectable()
export class CatalogSyncJob {
  private readonly logger = new Logger(CatalogSyncJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: TmdbAdapter,
    private readonly repository: CatalogRepository,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async syncStaleSeries(): Promise<void> {
    if (process.env.DISABLE_CATALOG_SYNC === 'true') return;

    const cutoff = new Date(Date.now() - SYNC_TTL_MS);
    const stale = await this.prisma.series.findMany({
      where: { syncedAt: { lt: cutoff } },
      select: { externalId: true },
      take: BATCH_SIZE,
    });

    let updated = 0;
    for (const { externalId } of stale) {
      try {
        const detail = await this.adapter.getSeriesDetail(externalId);
        await this.prisma.$transaction((tx) => this.repository.cacheSeries(tx, detail));
        updated += 1;
      } catch (error) {
        this.logger.warn(
          `Sincronização da série ${externalId} falhou: ${(error as Error).message}`,
        );
      }
    }

    if (updated > 0) this.logger.log(`Catálogo sincronizado: ${updated} série(s).`);
  }
}
