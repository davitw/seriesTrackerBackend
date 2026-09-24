import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { unauthenticated } from '../common/errors/error-codes';
import { AuthenticatedUser } from './jwt.strategy';

/**
 * Exige access token válido em toda rota de dado de usuário (FR-005).
 *
 * A falha é traduzida para o código estável do catálogo, em vez do 401 genérico do
 * Passport: o aplicativo precisa distinguir "sessão inválida" de qualquer outro erro.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser | false,
    _info: unknown,
    _context: ExecutionContext,
  ): TUser {
    if (err || !user) throw unauthenticated();
    return user;
  }
}
