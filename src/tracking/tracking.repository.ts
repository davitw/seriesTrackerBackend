import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface WatchedRecord {
  episodeId: string;
  watchedAt: Date;
}

@Injectable()
export class TrackingRepository {
  async findEpisode(
    tx: Prisma.TransactionClient,
    seriesId: string,
    episodeId: string,
  ): Promise<{ id: string; seasonNumber: number; episodeNumber: number; airDate: Date | null } | null> {
    return tx.episode.findFirst({
      where: { id: episodeId, seriesId },
      select: { id: true, seasonNumber: true, episodeNumber: true, airDate: true },
    });
  }

  /**
   * Marca como assistido. `on conflict do nothing` é o que torna a operação idempotente
   * sem sobrescrever o instante original da primeira marcação (FR-011).
   */
  async markWatched(
    tx: Prisma.TransactionClient,
    userId: string,
    episodeId: string,
    watchedAt: Date,
  ): Promise<boolean> {
    const inserted = await tx.$queryRaw<{ id: string }[]>`
      insert into public.user_episode_progress (user_id, episode_id, watched_at)
      values (${userId}::uuid, ${episodeId}::uuid, ${watchedAt})
      on conflict (user_id, episode_id) do nothing
      returning id
    `;
    return inserted.length > 0;
  }

  async findWatched(
    tx: Prisma.TransactionClient,
    userId: string,
    episodeId: string,
  ): Promise<WatchedRecord | null> {
    const row = await tx.userEpisodeProgress.findFirst({
      where: { userId, episodeId },
      select: { episodeId: true, watchedAt: true },
    });
    return row ? { episodeId: row.episodeId, watchedAt: row.watchedAt } : null;
  }

  /** Desmarcar não falha quando não havia marcação: a operação é idempotente. */
  async unmarkWatched(
    tx: Prisma.TransactionClient,
    userId: string,
    episodeId: string,
  ): Promise<number> {
    const removed = await tx.userEpisodeProgress.deleteMany({ where: { userId, episodeId } });
    return removed.count;
  }
}
