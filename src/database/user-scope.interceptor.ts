import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, defer, defaultIfEmpty, lastValueFrom } from 'rxjs';
import { PrismaService } from './prisma.service';
import { UserScope } from './user-scope';

interface AuthenticatedRequest {
  user?: { id?: string };
}

/**
 * Abre, por requisição autenticada, a transação que define `app.current_user_id`.
 *
 * Tudo que o handler faz acontece dentro dessa transação, na mesma conexão — condição
 * para que `SET LOCAL` tenha efeito sobre as consultas da RLS. Sem escopo (rotas
 * públicas), a requisição segue sem transação.
 */
@Injectable()
export class UserScopeInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: UserScope,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.id;

    if (!userId) {
      return next.handle();
    }

    return defer(() =>
      this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`select set_config('app.current_user_id', ${userId}, true)`;

          return this.scope.run({ tx, userId }, () =>
            lastValueFrom(next.handle().pipe(defaultIfEmpty(undefined))),
          );
        },
        { timeout: 15_000, isolationLevel: 'ReadCommitted' as never },
      ),
    );
  }
}
