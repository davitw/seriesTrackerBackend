import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface TokenServiceOptions {
  accessTtlSeconds?: number;
  refreshTtlDays?: number;
}

const DEFAULT_ACCESS_TTL_SECONDS = 900; // 15 minutos
const DEFAULT_REFRESH_TTL_DAYS = 30;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly options: TokenServiceOptions = {},
  ) {}

  get accessTtlSeconds(): number {
    return this.options.accessTtlSeconds ?? DEFAULT_ACCESS_TTL_SECONDS;
  }

  get refreshTtlDays(): number {
    return this.options.refreshTtlDays ?? DEFAULT_REFRESH_TTL_DAYS;
  }

  issueAccessToken(userId: string, email: string): string {
    return this.jwt.sign({ sub: userId, email }, { expiresIn: this.accessTtlSeconds });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwt.verify<AccessTokenPayload>(token);
  }

  /**
   * Credencial de renovação: valor opaco de alta entropia.
   *
   * O cliente recebe `value`; o banco guarda apenas `hash`. Um vazamento do banco não
   * concede sessões, porque o valor apresentado não é recuperável a partir do hash.
   */
  generateRefreshToken(): { value: string; hash: string } {
    const value = randomBytes(32).toString('hex');
    return { value, hash: this.hashRefreshToken(value) };
  }

  hashRefreshToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /** Janela deslizante: cada renovação emite um novo prazo cheio (FR-002, SC-012). */
  refreshExpiryFrom(now: Date): Date {
    return new Date(now.getTime() + this.refreshTtlDays * 86_400_000);
  }
}
