/**
 * Catálogo de códigos de erro estáveis (FR-019, SC-010).
 *
 * O código é a interface: o aplicativo cliente decide o que fazer a partir dele, nunca
 * a partir do texto da mensagem. Ver specs/001-series-tracking/contracts/errors.md.
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  SERIES_NOT_FOUND: 'SERIES_NOT_FOUND',
  SERIES_NOT_IN_PROFILE: 'SERIES_NOT_IN_PROFILE',
  EPISODE_NOT_FOUND: 'EPISODE_NOT_FOUND',
  EPISODE_NOT_AIRED: 'EPISODE_NOT_AIRED',
  CATALOG_UNAVAILABLE: 'CATALOG_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Erro de domínio: carrega o código estável e o status HTTP correspondente. */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

/**
 * Recurso inexistente *ou* pertencente a outra pessoa.
 * O Princípio I exige que os dois casos sejam indistinguíveis (404, nunca 403).
 */
export const seriesNotInProfile = () =>
  new DomainError(
    ErrorCode.SERIES_NOT_IN_PROFILE,
    'Série não encontrada no seu perfil.',
    404,
  );

export const seriesNotFound = () =>
  new DomainError(ErrorCode.SERIES_NOT_FOUND, 'Série não encontrada no catálogo.', 404);

export const episodeNotFound = () =>
  new DomainError(ErrorCode.EPISODE_NOT_FOUND, 'Episódio não encontrado.', 404);

export const invalidCredentials = () =>
  new DomainError(ErrorCode.INVALID_CREDENTIALS, 'E-mail ou senha inválidos.', 401);

export const invalidRefreshToken = () =>
  new DomainError(
    ErrorCode.INVALID_REFRESH_TOKEN,
    'Sessão expirada. Entre novamente.',
    401,
  );

export const unauthenticated = () =>
  new DomainError(ErrorCode.UNAUTHENTICATED, 'Sessão inválida ou expirada. Entre novamente.', 401);

export const emailAlreadyRegistered = () =>
  new DomainError(ErrorCode.EMAIL_ALREADY_REGISTERED, 'Este e-mail já está cadastrado.', 409);

/** Episódio ainda não liberado: a resposta precisa informar quando ele sai (FR-013). */
export const episodeNotAired = (airDate: string | null) =>
  new DomainError(ErrorCode.EPISODE_NOT_AIRED, 'Este episódio ainda não foi liberado.', 422, {
    airDate,
  });

export const catalogUnavailable = () =>
  new DomainError(
    ErrorCode.CATALOG_UNAVAILABLE,
    'A busca está indisponível no momento. Suas séries continuam acessíveis.',
    503,
  );
