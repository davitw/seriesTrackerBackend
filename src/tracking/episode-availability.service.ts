import { Injectable } from '@nestjs/common';
import { Clock } from '../common/clock/clock';
import { episodeNotAired } from '../common/errors/error-codes';

const toIsoDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

/**
 * Decide se um episódio já pode ser marcado (FR-013).
 *
 * Isolado em um serviço porque a regra depende de "hoje" — e o relógio é injetado,
 * não lido diretamente. Sem isso, o comportamento mudaria conforme o dia em que o
 * teste roda.
 */
@Injectable()
export class EpisodeAvailabilityService {
  constructor(private readonly clock: Clock) {}

  isAired(airDate: Date | null): boolean {
    return this.clock.isAired(toIsoDate(airDate));
  }

  /** Lança quando o episódio ainda não foi liberado, informando a data quando existe. */
  assertCanBeMarked(airDate: Date | null): void {
    if (!this.isAired(airDate)) {
      throw episodeNotAired(toIsoDate(airDate));
    }
  }
}
