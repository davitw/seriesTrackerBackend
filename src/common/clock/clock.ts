import { Injectable } from '@nestjs/common';

/**
 * Fonte de tempo injetável.
 *
 * Existe porque duas regras do produto dependem de "agora": classificar episódio como
 * liberado ou não (FR-013) e expirar a sessão após 30 dias sem uso (FR-002/SC-012).
 * Sem injeção, essas regras só seriam testáveis contra o relógio real — e os testes
 * seriam instáveis (Princípio III).
 */
export abstract class Clock {
  abstract now(): Date;

  /** Data de calendário de hoje em UTC (`YYYY-MM-DD`), no formato de `episodes.air_date`. */
  today(): string {
    return this.now().toISOString().slice(0, 10);
  }

  /**
   * Um episódio está liberado quando tem data de estreia e ela não está no futuro.
   * Data ausente conta como não liberado: sem metadado confiável, não se marca.
   */
  isAired(airDate: string | null | undefined): boolean {
    if (!airDate) return false;
    return airDate <= this.today();
  }
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

/** Relógio fixo, para testes determinísticos. */
export class FixedClock extends Clock {
  constructor(private readonly instant: Date) {
    super();
  }

  now(): Date {
    return new Date(this.instant.getTime());
  }
}
