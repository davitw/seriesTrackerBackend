import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { DomainError, ErrorCode } from '../common/errors/error-codes';

/** Parâmetros explícitos (OWASP): não dependemos do padrão da biblioteca. */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

const MIN_PASSWORD_LENGTH = 6;

@Injectable()
export class PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2_OPTIONS);
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }

  /**
   * Hash descartável com o mesmo custo do real.
   *
   * Usado quando a credencial não existe, para que a resposta de "e-mail inexistente"
   * e de "senha errada" gaste o mesmo tempo. Sem isso, a diferença de tempo entregaria
   * a existência da conta que FR-003 manda esconder.
   */
  async dummyVerify(plain: string): Promise<void> {
    const hash = await this.hash('senha-inexistente-para-igualar-o-tempo');
    await argon2.verify(hash, plain).catch(() => false);
  }

  assertStrong(plain: string): void {
    if (plain.length < MIN_PASSWORD_LENGTH) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 'Dados inválidos.', 422, {
        fields: { password: `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.` },
      });
    }
  }
}
