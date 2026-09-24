import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { emailAlreadyRegistered } from '../common/errors/error-codes';
import { PrismaService } from '../database/prisma.service';

export interface Credentials {
  id: string;
  passwordHash: string;
}

export interface RefreshSessionRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * Acesso ao banco para autenticação.
 *
 * Registro e verificação de credenciais acontecem **antes** de existir sessão, então
 * passam pelas funções SECURITY DEFINER. Tudo que toca `refresh_tokens` roda com escopo
 * de usuário explícito, porque a RLS não abre exceção para a aplicação.
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async register(id: string, email: string, passwordHash: string): Promise<void> {
    try {
      await this.prisma.$queryRaw`select app_register_user(${id}::uuid, ${email}, ${passwordHash})`;
    } catch (error) {
      if (this.isUniqueViolation(error)) throw emailAlreadyRegistered();
      throw error;
    }
  }

  async findCredentials(email: string): Promise<Credentials | null> {
    const rows = await this.prisma.$queryRaw<{ id: string; password_hash: string }[]>`
      select * from app_find_credentials(${email})
    `;
    const row = rows[0];
    return row ? { id: row.id, passwordHash: row.password_hash } : null;
  }

  async findRefreshSession(tokenHash: string): Promise<RefreshSessionRecord | null> {
    const rows = await this.prisma.$queryRaw<
      { id: string; user_id: string; expires_at: Date; revoked_at: Date | null }[]
    >`select * from app_find_refresh_session(${tokenHash})`;
    const row = rows[0];
    return row
      ? { id: row.id, userId: row.user_id, expiresAt: row.expires_at, revokedAt: row.revoked_at }
      : null;
  }

  async revokeAllSessions(userId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ app_revoke_all_sessions: number }[]>`
      select app_revoke_all_sessions(${userId}::uuid)
    `;
    return rows[0]?.app_revoke_all_sessions ?? 0;
  }

  /** Executa `fn` em transação com `app.current_user_id` definido. */
  async inUserScope<T>(
    userId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`select set_config('app.current_user_id', ${userId}, true)`;
      return fn(tx);
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const meta = error.meta as { code?: string } | undefined;
      if (meta?.code === '23505') return true;
    }
    return error instanceof Error && error.message.includes('email_already_registered');
  }
}
