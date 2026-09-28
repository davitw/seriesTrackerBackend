import { z } from 'zod';

/**
 * Validação da resposta do provedor externo.
 *
 * Tudo que chega de fora passa por aqui antes de virar dado interno: campo ausente ou
 * tipo inesperado vira erro explícito, nunca `null` silencioso ou string onde se espera
 * número (Princípio II).
 */

/** Forma do item de série, compartilhada entre a busca e as listas. */
const seriesItemSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  original_name: z.string().nullish(),
  first_air_date: z.string().nullish(),
  overview: z.string().nullish(),
  poster_path: z.string().nullish(),
});
export const searchResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      original_name: z.string().nullish(),
      first_air_date: z.string().nullish(),
      overview: z.string().nullish(),
      poster_path: z.string().nullish(),
    }),
  ),
});

/**
 * Lista de destaques (populares, em exibição, mais bem avaliadas).
 *
 * O **envelope** tem schema próprio, separado do de busca, para que uma mudança numa operação
 * não afete a outra em silêncio. A **forma do item** é a mesma, e por isso é declarada uma vez
 * em `seriesItemSchema` (R-005).
 */
export const listResponseSchema = z.object({
  results: z.array(seriesItemSchema),
});

export const seriesDetailSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  original_name: z.string().nullish(),
  first_air_date: z.string().nullish(),
  overview: z.string().nullish(),
  poster_path: z.string().nullish(),
  status: z.string().nullish(),
  seasons: z
    .array(
      z.object({
        season_number: z.number().int(),
        name: z.string().nullish(),
        air_date: z.string().nullish(),
        episode_count: z.number().int().nullish(),
        poster_path: z.string().nullish(),
      }),
    )
    .default([]),
});

export const seasonDetailSchema = z.object({
  season_number: z.number().int(),
  episodes: z
    .array(
      z.object({
        episode_number: z.number().int(),
        name: z.string().nullish(),
        overview: z.string().nullish(),
        air_date: z.string().nullish(),
        runtime: z.number().int().nullish(),
        still_path: z.string().nullish(),
      }),
    )
    .default([]),
});

export type TmdbSearchResponse = z.infer<typeof searchResponseSchema>;
export type TmdbSeriesDetail = z.infer<typeof seriesDetailSchema>;
export type TmdbSeasonDetail = z.infer<typeof seasonDetailSchema>;
