import { z } from 'zod';

/**
 * Validação das variáveis de ambiente no boot.
 *
 * Falha rápido e alto: um serviço que sobe sem segredo de assinatura ou sem string de
 * conexão está quebrado de um jeito pior do que um serviço que não sobe. Os valores
 * nunca entram na mensagem de erro.
 */
export const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'obrigatória'),
  DATABASE_URL_TEST: z.string().min(1).optional(),
  MIGRATE_DATABASE_URL: z.string().min(1).optional(),
  TEST_MIGRATE_DATABASE_URL: z.string().min(1).optional(),
  JWT_ACCESS_SECRET: z.string().min(32, 'precisa de no mínimo 32 caracteres'),
  TMDB_API_KEY: z.string().min(1, 'obrigatória'),
  PORT: z.coerce.number().int().positive().default(3000),
  AUTH_RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuração de ambiente inválida — ${fields.join('; ')}`);
  }
  return parsed.data;
}
