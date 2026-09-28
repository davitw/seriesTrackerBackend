import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CatalogSeriesSummary } from './tmdb.adapter';

export interface ListItem {
  externalId: number;
  title: string;
  firstAirDate: Date | null;
  posterPath: string | null;
  position: number;
}

export interface ListWithItems {
  id: string;
  key: string;
  name: string;
  syncedAt: Date | null;
  items: ListItem[];
}

/**
 * Leitura e escrita das listas de destaques.
 *
 * Usa o cliente base, sem escopo de sessão: as listas são catálogo global, não dado de
 * usuário — mesma situação de `series`, `seasons` e `episodes`.
 */
@Injectable()
export class CatalogListsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Todas as listas com seus itens, na ordem definida pelo provedor. */
  async listAll(): Promise<ListWithItems[]> {
    const lists = await this.prisma.catalogList.findMany({
      orderBy: { key: 'asc' },
      include: { items: { orderBy: { position: 'asc' } } },
    });

    return lists.map((list) => ({
      id: list.id,
      key: list.key,
      name: list.name,
      syncedAt: list.syncedAt,
      items: list.items.map((item) => ({
        externalId: item.externalId,
        title: item.title,
        firstAirDate: item.firstAirDate,
        posterPath: item.posterPath,
        position: item.position,
      })),
    }));
  }

  async findByKey(key: string): Promise<ListWithItems | null> {
    const list = await this.prisma.catalogList.findUnique({
      where: { key },
      include: { items: { orderBy: { position: 'asc' } } },
    });

    if (!list) return null;

    return {
      id: list.id,
      key: list.key,
      name: list.name,
      syncedAt: list.syncedAt,
      items: list.items.map((item) => ({
        externalId: item.externalId,
        title: item.title,
        firstAirDate: item.firstAirDate,
        posterPath: item.posterPath,
        position: item.position,
      })),
    };
  }

  /**
   * Substitui o conteúdo de uma lista e marca a sincronização — na mesma transação.
   *
   * A transação é aberta aqui, e não recebida por parâmetro, porque este método é chamado de
   * dois contextos diferentes: de dentro de uma requisição (na primeira execução) e do job
   * agendado, que roda fora de qualquer requisição. Abrir localmente mantém os dois corretos
   * sem que nenhum deles precise lembrar de envolver a chamada.
   *
   * A substituição é total (remove e insere) para que a ordem nova valha e para que séries
   * que saíram dos destaques desapareçam. `position` é o índice na ordem devolvida pelo
   * provedor, preservada sem reordenação própria.
   */
  async replaceItems(listId: string, items: CatalogSeriesSummary[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.catalogListItem.deleteMany({ where: { listId } });

      if (items.length > 0) {
        await tx.catalogListItem.createMany({
          data: items.map((item, index) => ({
            listId,
            externalId: item.externalId,
            title: item.title,
            firstAirDate: item.firstAirDate ? new Date(item.firstAirDate) : null,
            posterPath: item.posterPath,
            position: index,
          })),
        });
      }

      await tx.catalogList.update({
        where: { id: listId },
        data: { syncedAt: new Date() },
      });
    });
  }
}
