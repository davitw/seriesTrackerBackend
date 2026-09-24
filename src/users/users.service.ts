import { Injectable } from '@nestjs/common';
import { unauthenticated } from '../common/errors/error-codes';
import { UserScope } from '../database/user-scope';
import { UserProfile } from '../auth/auth.service';

@Injectable()
export class UsersService {
  constructor(private readonly scope: UserScope) {}

  /**
   * Perfil da pessoa autenticada.
   *
   * Não recebe `userId` como parâmetro de propósito: o escopo já está na sessão do banco,
   * e a RLS filtra. Assim não existe caminho de código capaz de consultar outra conta.
   */
  async getProfile(): Promise<UserProfile> {
    const rows = await this.scope.client.$queryRaw<
      { id: string; email: string; created_at: Date }[]
    >`select id, email, created_at from users where id = ${this.scope.userId}::uuid`;

    const row = rows[0];
    // Credencial válida de uma conta que já não existe: trata como sessão inválida.
    if (!row) throw unauthenticated();

    return { id: row.id, email: row.email, createdAt: row.created_at.toISOString() };
  }

  /**
   * Encerra a conta (FR-020).
   *
   * O `delete` na própria linha dispara os `ON DELETE CASCADE`, que levam perfil,
   * progresso e **todas as sessões ativas** — inclusive as que estiverem abertas em
   * outro dispositivo, como a constituição exige.
   */
  async deleteAccount(): Promise<void> {
    await this.scope.client.$executeRaw`
      delete from users where id = ${this.scope.userId}::uuid
    `;
  }
}
