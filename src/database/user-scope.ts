import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type ScopedTransaction = Prisma.TransactionClient;

export interface UserScopeStore {
  tx: ScopedTransaction;
  userId: string;
}

/**
 * Escopo de dados por requisição.
 *
 * O cliente escopado existe dentro de uma transação que já executou
 * `SET LOCAL app.current_user_id`. É a RLS que filtra as linhas — a aplicação apenas
 * garante que a sessão do banco carrega a identidade correta.
 *
 * `client` lança quando não há escopo em vez de devolver o cliente global: um
 * repositório que esqueça o escopo falha alto, não vaza em silêncio.
 */
@Injectable()
export class UserScope {
  private readonly storage = new AsyncLocalStorage<UserScopeStore>();

  run<T>(store: UserScopeStore, fn: () => T): T {
    return this.storage.run(store, fn);
  }

  get store(): UserScopeStore | undefined {
    return this.storage.getStore();
  }

  get hasScope(): boolean {
    return this.storage.getStore() !== undefined;
  }

  get userId(): string {
    const store = this.storage.getStore();
    if (!store) {
      throw new Error('Nenhum escopo de usuário ativo: a rota exige sessão autenticada.');
    }
    return store.userId;
  }

  get client(): ScopedTransaction {
    const store = this.storage.getStore();
    if (!store) {
      throw new Error('Nenhum escopo de usuário ativo: use o cliente escopado apenas em rota autenticada.');
    }
    return store.tx;
  }
}
