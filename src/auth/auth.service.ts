import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Clock } from '../common/clock/clock';
import { invalidCredentials, invalidRefreshToken } from '../common/errors/error-codes';
import { AuthRepository } from './auth.repository';
import { PasswordHasher } from './password.hasher';
import { TokenService } from './token.service';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface UserProfile {
  id: string;
  email: string;
  createdAt: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
  ) {}

  async register(email: string, password: string): Promise<UserProfile> {
    this.hasher.assertStrong(password);

    const id = randomUUID();
    const passwordHash = await this.hasher.hash(password);
    await this.repository.register(id, email, passwordHash);

    const createdAt = await this.repository.inUserScope(id, async (tx) => {
      const rows = await tx.$queryRaw<{ created_at: Date }[]>`
        select created_at from public.users where id = ${id}::uuid
      `;
      return rows[0]!.created_at;
    });

    return { id, email: email.toLowerCase(), createdAt: createdAt.toISOString() };
  }

  async login(email: string, password: string): Promise<AuthSession> {
    const credentials = await this.repository.findCredentials(email);

    if (!credentials) {
      // Gasta o mesmo tempo de uma verificação real: a diferença de latência
      // entregaria a existência da conta que FR-003 manda esconder.
      await this.hasher.dummyVerify(password);
      throw invalidCredentials();
    }

    const matches = await this.hasher.verify(credentials.passwordHash, password);
    if (!matches) throw invalidCredentials();

    return this.repository.inUserScope(credentials.id, (tx) =>
      this.createSession(tx, credentials.id, email.toLowerCase()),
    );
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const session = await this.repository.findRefreshSession(
      this.tokens.hashRefreshToken(refreshToken),
    );

    if (!session) throw invalidRefreshToken();

    // Credencial já rotacionada sendo reapresentada: ou vazou, ou alguém está tentando
    // replay. Em qualquer caso, todas as sessões da conta caem.
    if (session.revokedAt) {
      await this.repository.revokeAllSessions(session.userId);
      throw invalidRefreshToken();
    }

    if (session.expiresAt.getTime() <= this.clock.now().getTime()) {
      throw invalidRefreshToken();
    }

    return this.repository.inUserScope(session.userId, async (tx) => {
      await tx.$executeRaw`
        update public.refresh_tokens set revoked_at = now() where id = ${session.id}::uuid
      `;
      const rows = await tx.$queryRaw<{ email: string }[]>`
        select email from public.users where id = ${session.userId}::uuid
      `;
      return this.createSession(tx, session.userId, rows[0]!.email);
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const session = await this.repository.findRefreshSession(
      this.tokens.hashRefreshToken(refreshToken),
    );

    // Sair é idempotente: um token desconhecido não é erro para quem só quer encerrar.
    if (!session || session.revokedAt) return;

    await this.repository.inUserScope(session.userId, async (tx) => {
      await tx.$executeRaw`
        update public.refresh_tokens set revoked_at = now()
        where id = ${session.id}::uuid and revoked_at is null
      `;
    });
  }

  private async createSession(
    tx: Prisma.TransactionClient,
    userId: string,
    email: string,
  ): Promise<AuthSession> {
    const { value, hash } = this.tokens.generateRefreshToken();
    const expiresAt = this.tokens.refreshExpiryFrom(this.clock.now());

    await tx.$executeRaw`
      insert into public.refresh_tokens (user_id, token_hash, expires_at)
      values (${userId}::uuid, ${hash}, ${expiresAt})
    `;

    return {
      accessToken: this.tokens.issueAccessToken(userId, email),
      refreshToken: value,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessTtlSeconds,
    };
  }
}
