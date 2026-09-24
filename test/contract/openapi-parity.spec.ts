import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestApp } from '../helpers/app';
import { loadRootEnv } from '../helpers/db';

interface OperationLike {
  requestBody?: { content?: Record<string, { schema?: { $ref?: string } }> };
  parameters?: { name: string; in: string; required?: boolean }[];
  responses?: Record<string, unknown>;
}

/**
 * T065 — portões da documentação.
 *
 * O contrato em `contracts/openapi.yaml` e o serviço real não podem divergir; e o documento
 * gerado precisa **responder o que cada endpoint exige** — não apenas listar rotas. Um
 * Swagger que mostra `/v1/auth/register` sem dizer que o corpo leva `email` e `password` é
 * pior que nenhum, porque parece completo.
 */
describe('Paridade e completude do contrato OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  const operacoes = (): [string, string, OperationLike][] => {
    const lista: [string, string, OperationLike][] = [];
    for (const [path, metodos] of Object.entries(document.paths)) {
      for (const [method, op] of Object.entries(metodos)) {
        lista.push([method.toUpperCase(), path, op as OperationLike]);
      }
    }
    return lista;
  };

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp();
    document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
  });

  afterAll(async () => {
    await app.close();
  });

  it('toda rota declarada no contrato existe na aplicação', () => {
    const yaml = readFileSync(
      join(__dirname, '..', '..', 'specs', '001-series-tracking', 'contracts', 'openapi.yaml'),
      'utf8',
    );

    // O documento gerado inclui o prefixo global (`/v1`), então a comparação é direta.
    const declared = [...yaml.matchAll(/^ {2}(\/v1\/[A-Za-z0-9/{}._-]+):/gm)].map(
      (match) => match[1]!,
    );
    const implemented = new Set(Object.keys(document.paths));

    expect(declared.length).toBeGreaterThan(0);
    expect(declared.filter((path) => !implemented.has(path))).toEqual([]);
  });

  it('o contrato documenta a limitação de taxa nas rotas públicas de autenticação', () => {
    const yaml = readFileSync(
      join(__dirname, '..', '..', 'specs', '001-series-tracking', 'contracts', 'openapi.yaml'),
      'utf8',
    );
    expect(yaml).toMatch(/RATE_LIMITED/);
  });

  it('nenhum corpo de requisição é documentado como objeto vazio', () => {
    const schemas = document.components?.schemas ?? {};
    const vazios: string[] = [];

    for (const [method, path, op] of operacoes()) {
      const ref = op.requestBody?.content?.['application/json']?.schema?.$ref;
      if (!ref) continue;

      const nome = ref.split('/').pop()!;
      const schema = schemas[nome] as { properties?: Record<string, unknown> } | undefined;
      if (!schema?.properties || Object.keys(schema.properties).length === 0) {
        vazios.push(`${method} ${path} -> ${nome}`);
      }
    }

    expect(vazios).toEqual([]);
  });

  it('nenhum parâmetro de paginação é documentado como obrigatório', () => {
    const paginacao = new Set(['limit', 'offset']);
    const indevidos: string[] = [];

    for (const [method, path, op] of operacoes()) {
      for (const param of op.parameters ?? []) {
        if (param.in === 'query' && paginacao.has(param.name) && param.required === true) {
          indevidos.push(`${method} ${path} -> ${param.name}`);
        }
      }
    }

    expect(indevidos).toEqual([]);
  });

  it('toda operação documenta ao menos um código de erro', () => {
    const semErro: string[] = [];

    for (const [method, path, op] of operacoes()) {
      const status = Object.keys(op.responses ?? {});
      const temErro = status.some((codigo) => Number(codigo) >= 400);
      if (!temErro) semErro.push(`${method} ${path}`);
    }

    expect(semErro).toEqual([]);
  });

  it('as operações autenticadas declaram o esquema de segurança', () => {
    const publicas = new Set([
      'POST /v1/auth/register',
      'POST /v1/auth/login',
      'POST /v1/auth/refresh',
      'POST /v1/auth/logout',
    ]);

    const semSeguranca: string[] = [];
    for (const [method, path, op] of operacoes()) {
      const assinatura = `${method} ${path}`;
      if (publicas.has(assinatura)) continue;
      const declarado = (op as { security?: unknown[] }).security;
      if (!Array.isArray(declarado) || declarado.length === 0) {
        semSeguranca.push(assinatura);
      }
    }

    expect(semSeguranca).toEqual([]);
  });
});
