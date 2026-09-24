import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestApp } from '../helpers/app';
import { loadRootEnv } from '../helpers/db';

/**
 * T065 — portão 5 da constituição: o contrato documentado e o serviço real não podem
 * divergir. Sem esta verificação, `contracts/openapi.yaml` deixa de ser contrato e passa
 * a ser ficção.
 */
describe('Paridade entre o contrato OpenAPI e as rotas implementadas', () => {
  let app: INestApplication;

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('toda rota declarada no contrato existe na aplicação', () => {
    const yaml = readFileSync(
      join(__dirname, '..', '..', 'specs', '001-series-tracking', 'contracts', 'openapi.yaml'),
      'utf8',
    );

    // O documento gerado pela aplicação inclui o prefixo global (`/v1`), então a
    // comparação é direta.
    const declared = [...yaml.matchAll(/^ {2}(\/v1\/[A-Za-z0-9/{}._-]+):/gm)].map(
      (match) => match[1]!,
    );

    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    const implemented = new Set(Object.keys(document.paths));

    expect(declared.length).toBeGreaterThan(0);

    const missing = declared.filter((path) => !implemented.has(path));
    expect(missing).toEqual([]);
  });

  it('o contrato documenta a limitação de taxa nas rotas públicas de autenticação', () => {
    const yaml = readFileSync(
      join(__dirname, '..', '..', 'specs', '001-series-tracking', 'contracts', 'openapi.yaml'),
      'utf8',
    );
    // FR-021: o 429 precisa estar no contrato, senão o cliente não sabe o que esperar.
    expect(yaml).toMatch(/RATE_LIMITED/);
  });
});
