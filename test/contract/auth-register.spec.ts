import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createTestApp } from '../helpers/app';
import { cleanupUsers, loadRootEnv, testPrismaClient } from '../helpers/db';

/** T020 — contrato de registro (FR-001). */
describe('POST /v1/auth/register', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const created: string[] = [];

  beforeAll(async () => {
    loadRootEnv();
    app = await createTestApp();
    prisma = testPrismaClient();
  });

  afterAll(async () => {
    await cleanupUsers(prisma, created);
    await prisma.$disconnect();
    await app.close();
  });

  it('cria a conta e nunca devolve a senha', async () => {
    const email = `register-${randomUUID()}@example.com`;
    const response = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'segredo123' })
      .expect(201);

    expect(response.body.id).toBeDefined();
    expect(response.body.email).toBe(email);
    expect(response.body.createdAt).toBeDefined();
    expect(JSON.stringify(response.body)).not.toContain('segredo123');
    expect(JSON.stringify(response.body)).not.toContain('password');
    created.push(response.body.id);
  });

  it('normaliza o e-mail para minúsculas', async () => {
    const email = `Register-${randomUUID()}@Example.com`;
    const response = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'segredo123' })
      .expect(201);
    expect(response.body.email).toBe(email.toLowerCase());
    created.push(response.body.id);
  });

  it('recusa e-mail já cadastrado com código distinguível', async () => {
    const email = `dup-${randomUUID()}@example.com`;
    const first = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'segredo123' })
      .expect(201);
    created.push(first.body.id);

    const response = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password: 'segredo123' })
      .expect(409);

    expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('recusa senha com menos de 6 caracteres com VALIDATION_ERROR', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: `curta-${randomUUID()}@example.com`, password: '12345' })
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.fields).toHaveProperty('password');
  });

  it('recusa e-mail malformado', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: 'nao-e-email', password: 'segredo123' })
      .expect(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('recusa campo desconhecido em vez de ignorá-lo', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: `extra-${randomUUID()}@example.com`, password: 'segredo123', admin: true })
      .expect(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
