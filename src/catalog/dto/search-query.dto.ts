import { z } from 'zod';

/** Termo de busca: curto demais não produz resultado útil e é recusado (FR-006). */
export const searchQuerySchema = z.object({
  query: z.string().min(2, 'Informe ao menos 2 caracteres para a busca.'),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
