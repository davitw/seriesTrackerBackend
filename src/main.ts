import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/errors/http-exception.filter';
import { validationExceptionFactory } from './common/errors/validation';
import { UserScopeInterceptor } from './database/user-scope.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  app.setGlobalPrefix('v1');

  // `forbidNonWhitelisted` recusa campo desconhecido em vez de ignorá-lo em silêncio.
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

  // Só confia em cabeçalho de proxy quando explicitamente habilitado: caso contrário
  // qualquer cliente poderia forjar a origem e escapar da limitação de taxa (FR-021).
  if (process.env.TRUST_PROXY === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  const openApiConfig = new DocumentBuilder()
    .setTitle('SeriesTracker Backend API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, openApiConfig));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
