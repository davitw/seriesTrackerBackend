import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface SeriesLink {
  id: string;
  seriesId: string;
  addedAt: Date;
  lastWatchedAt: Date | null;
}

@Injectable()
export class LibraryRepository {
  /** Vínculo série ↔ perfil. Devolve `true` apenas quando a linha foi criada agora. */
  async linkSeries(
    tx: Prisma.TransactionClient,
    userId: string,
    seriesId: string,
  ): Promise<boolean> {
    const created = await tx.$queryRaw<{ id: string }[]>`
      insert into public.user_series (user_id, series_id)
      values (${userId}::uuid, ${seriesId}::uuid)
      on conflict (user_id, series_id) do nothing
      returning id
    `;
    return created.length > 0;
  }

  async findLink(
    tx: Prisma.TransactionClient,
    userId: string,
    seriesId: string,
  ): Promise<SeriesLink | null> {
    return tx.userSeries.findFirst({
      where: { userId, seriesId },
      select: { id: true, seriesId: true, addedAt: true, lastWatchedAt: true },
    });
  }

  /** Ordena pelas acessadas mais recentemente — as "últimas 5" saem do topo (FR-008). */
  async listLinks(
    tx: Prisma.TransactionClient,
    userId: string,
    limit: number,
    offset: number,
  ): Promise<SeriesLink[]> {
    return tx.userSeries.findMany({
      where: { userId },
      orderBy: [{ lastWatchedAt: { sort: 'desc', nulls: 'last' } }, { addedAt: 'desc' }],
      skip: offset,
      take: limit,
      select: { id: true, seriesId: true, addedAt: true, lastWatchedAt: true },
    });
  }

  async countLinks(tx: Prisma.TransactionClient, userId: string): Promise<number> {
    return tx.userSeries.count({ where: { userId } });
  }

  /**
   * Remove o vínculo e descarta o progresso daquela série para aquele usuário (FR-009).
   * As duas escritas acontecem na mesma transação: não existe estado intermediário em
   * que a série saiu do perfil mas o progresso ficou.
   */
  async removeLink(
    tx: Prisma.TransactionClient,
    userId: string,
    seriesId: string,
  ): Promise<boolean> {
    const removed = await tx.userSeries.deleteMany({ where: { userId, seriesId } });
    if (removed.count === 0) return false;

    await tx.$executeRaw`
      delete from public.user_episode_progress
      where user_id = ${userId}::uuid
        and episode_id in (select id from public.episodes where series_id = ${seriesId}::uuid)
    `;
    return true;
  }

  /** Avança o "acessado recentemente" sem nunca retroceder. */
  async touchLastWatched(
    tx: Prisma.TransactionClient,
    userId: string,
    seriesId: string,
    at: Date,
  ): Promise<void> {
    await tx.$executeRaw`
      update public.user_series
         set last_watched_at = ${at}
       where user_id = ${userId}::uuid
         and series_id = ${seriesId}::uuid
         and (last_watched_at is null or last_watched_at < ${at})
    `;
  }
}
