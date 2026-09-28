import { Injectable, Logger } from '@nestjs/common';
import { catalogUnavailable } from '../common/errors/error-codes';
import { CatalogListsRepository, ListWithItems } from './catalog.lists.repository';
import { TmdbAdapter } from './tmdb.adapter';

/** Quantos itens cada lista carrega — uma página do provedor. */
export const LIST_SIZE = 20;

export interface ListItemView {
  externalId: number;
  title: string;
  firstAirDate: string | null;
  posterPath: string | null;
}

export interface ListView {
  key: string;
  name: string;
  updatedAt: string | null;
  items: ListItemView[];
}

export interface DiscoverView {
  lists: ListView[];
}

const toIsoDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

/**
 * Listas de destaques da home.
 *
 * A regra de degradação é decidida pelo **conteúdo disponível**, não pelo estado do provedor:
 * o cache é servido sempre que existe, e indisponibilidade só é declarada quando nada foi
 * obtido E o provedor falhou. As duas coisas significam coisas diferentes para quem usa —
 * "não consegui obter" contra "não há destaques" — e confundi-las levaria a acreditar na
 * segunda (FR-005, FR-006, FR-007).
 */
@Injectable()
export class CatalogListsService {
  private readonly logger = new Logger(CatalogListsService.name);

  constructor(
    private readonly repository: CatalogListsRepository,
    private readonly adapter: TmdbAdapter,
  ) {}

  async getLists(): Promise<DiscoverView> {
    let lists = await this.repository.listAll();

    // Lista nunca obtida: tenta agora. Sem isso, um banco recém-migrado produziria home vazia
    // até o job da madrugada rodar (R-004).
    const nuncaObtidas = lists.filter((lista) => lista.syncedAt === null);
    let provedorFalhou = false;

    for (const lista of nuncaObtidas) {
      try {
        await this.refreshList(lista);
      } catch (error) {
        provedorFalhou = true;
        this.logger.warn(`Lista ${lista.key} indisponível: ${(error as Error).message}`);
      }
    }

    if (nuncaObtidas.length > 0) {
      lists = await this.repository.listAll();
    }

    const semConteudoAlgum = lists.every((lista) => lista.items.length === 0);

    // FR-006: nada disponível E o provedor falhou. Uma lista genuinamente vazia não passa por
    // aqui — nesse caso o provedor respondeu, e a resposta é `200` com `items: []`.
    if (semConteudoAlgum && provedorFalhou) {
      throw catalogUnavailable();
    }

    return { lists: lists.map((lista) => this.toView(lista)) };
  }

  private async refreshList(lista: ListWithItems): Promise<void> {
    const items = await this.adapter.getList(lista.key, LIST_SIZE);
    await this.repository.replaceItems(lista.id, items);
  }

  private toView(lista: ListWithItems): ListView {
    return {
      key: lista.key,
      name: lista.name,
      updatedAt: lista.syncedAt?.toISOString() ?? null,
      items: lista.items.map((item) => ({
        externalId: item.externalId,
        title: item.title,
        firstAirDate: toIsoDate(item.firstAirDate),
        posterPath: item.posterPath,
      })),
    };
  }
}
