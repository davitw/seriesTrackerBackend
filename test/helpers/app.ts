import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TestingModuleBuilder, Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/errors/http-exception.filter';
import { validationExceptionFactory } from '../../src/common/errors/validation';
import { UserScopeInterceptor } from '../../src/database/user-scope.interceptor';
import { loadRootEnv, requireTestDatabaseUrl } from './db';

/**
 * Sobe a aplicação real contra o banco de teste.
 *
 * A mesma configuração de `main.ts` é aplicada (prefixo, pipe, filtro, interceptor) —
 * um teste de contrato que roda com configuração diferente da produção não prova nada
 * sobre o contrato.
 */
export async function createTestApp(
  configure?: (builder: TestingModuleBuilder) => void,
): Promise<INestApplication> {
  loadRootEnv();
  // A aplicação deve falar com o banco de teste, não com o de desenvolvimento.
  process.env.DATABASE_URL = requireTestDatabaseUrl();

  const builder = Test.createTestingModule({ imports: [AppModule] });
  configure?.(builder);
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(app.get(UserScopeInterceptor));
  await app.init();

  return app;
}
