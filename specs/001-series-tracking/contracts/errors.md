# Catálogo de códigos de erro

**Feature**: `001-series-tracking` | **Date**: 2026-09-23 | **Requisito**: FR-019, SC-010

Todo erro de resposta carrega `error.code` estável (não traduzido, não reformulado entre versões) e
`error.message` legível. Nenhuma falha é apresentada como sucesso.

## Códigos

| Código | HTTP | Quando ocorre | Requisito |
|--------|------|---------------|-----------|
| `VALIDATION_ERROR` | 422 | Corpo ou parâmetro inválido (e-mail malformado, senha curta, campo desconhecido). `details.fields` indica os campos | FR-001 |
| `UNAUTHENTICATED` | 401 | Sessão ausente, access token inválido ou expirado | FR-005 |
| `INVALID_CREDENTIALS` | 401 | E-mail inexistente **ou** senha incorreta — mesma resposta nos dois casos | FR-003 |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh token inválido, expirado, revogado ou reutilizado | FR-002, FR-004 |
| `EMAIL_ALREADY_REGISTERED` | 409 | Cadastro com e-mail já existente | FR-001 |
| `SERIES_NOT_FOUND` | 404 | `externalId` não existe no catálogo | FR-006, FR-007 |
| `SERIES_NOT_IN_PROFILE` | 404 | Série não pertence ao perfil do usuário autenticado (inclui o caso de a série pertencer a outro usuário) | FR-016 |
| `EPISODE_NOT_FOUND` | 404 | Episódio não pertence à série informada | FR-011 |
| `EPISODE_NOT_AIRED` | 422 | Tentativa de marcar episódio com estreia futura ou sem data conhecida; `details.airDate` traz a data quando existir | FR-013 |
| `CATALOG_UNAVAILABLE` | 503 | Catálogo externo indisponível **e** o dado necessário não está em cache | FR-018 |
| `RATE_LIMITED` | 429 | Excesso de requisições por origem nas rotas públicas de cadastro e entrada | FR-021 |
| `INTERNAL_ERROR` | 500 | Falha inesperada; a mensagem não expõe detalhe interno nem dado sensível | FR-019 |

## Regras

- Código novo só entra com requisito associado e teste de contrato correspondente.
- `EPISODE_NOT_AIRED` é o único erro de domínio que carrega dado adicional obrigatório (`airDate`),
  porque a interface precisa exibir a data de liberação (FR-013).
- `SERIES_NOT_IN_PROFILE` é deliberadamente o **mesmo** código para "série não existe" e "série é de
  outro usuário": o Princípio I exige que acesso cruzado seja indistinguível de recurso inexistente.
- `RATE_LIMITED` só é emitido nas rotas públicas de autenticação (`POST /v1/auth/register` e
  `POST /v1/auth/login`). As demais rotas não são limitadas por taxa nesta versão.
- Falha do catálogo externo em operação que não depende dele nunca resulta em erro: a operação segue
  com os dados em cache (FR-018).
