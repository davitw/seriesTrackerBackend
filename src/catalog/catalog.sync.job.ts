import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { CatalogListsRepository } from './catalog.lists.repository';
import { LIST_SIZE } from './catalog.lists.service';
import { CatalogRepository } from './catalog.repository';
import { TmdbAdapter } from './tmdb.adapter';

const SYNC_TTL_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 50;

/**
 * Manutenção periódica do catálogo.
 *
 * Listas de destaques e metadados de séries acompanhadas são atualizados na mesma passada, de
 * propósito: um segundo agendador seria mais uma peça para o mesmo tipo de trabalho e mais um
 * lugar onde `DISABLE_CATALOG_SYNC` precisaria ser respeitado (Princípio V).
 *
 * Nenhuma falha de um item derruba a passada inteira — o produto continua servindo o que já
 * tem em cache enquanto isso.
 */
@Injectable()
export class CatalogSyncJob {
  private readonly logger = new Logger(CatalogSyncJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: TmdbAdapter,
    private readonly repository: CatalogRepository,
    private readonly listsRepository: CatalogListsRepository,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async syncCatalog(): Promise<void> {
    if (process.env.DISABLE_CATALOG_SYNC === 'true') return;

    await this.syncLists();
    await this.syncStaleSeries();
  }

  /**
   * Reobtém o conteúdo das três listas.
   *
   * Público para que os testes exercitem a atualização sem esperar o agendador.
   */
  async syncLists(): Promise<void> {
    const lists = await this.listsRepository.listAll();
    let updated = 0;

    for (const lista of lists) {
      try {
        const items = await this.adapter.getList(lista.key, LIST_SIZE);
        await this.listsRepository.replaceItems(lista.id, items);
        updated += 1;
      } catch (error) {
        this.logger.warn(`Lista ${lista.key} não sincronizou: ${(error as Error).message}`);
      }
    }

    if (updated > 0) this.logger.log(`Listas sincronizadas: ${updated}.`);
  }

  private async syncStaleSeries(): Promise<void> {
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
