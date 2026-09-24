# SeriesTracker — Backend

Serviço HTTP que alimenta o aplicativo SeriesTracker: autenticação por e-mail e senha com JWT,
busca de séries em catálogo externo, perfil de séries do usuário, marcação de episódios assistidos
e progresso por temporada.

Stack: **Node.js + TypeScript + NestJS**, **PostgreSQL** (Supabase), **Prisma**, **JWT** próprio
(access de curta duração + refresh revogável com rotação).

Plano e especificação completos: [`specs/001-series-tracking/`](specs/001-series-tracking/).

## Pré-requisitos

- Node.js 22+ (ambiente de referência: v26.9.0) e npm 11+
- Instância PostgreSQL 15+ acessível
- Credencial da API do TMDB (para busca e carga de metadados)

## Setup

```bash
npm ci
cp .env.example .env          # preencha DATABASE_URL, JWT_ACCESS_SECRET e TMDB_API_KEY
npx prisma migrate deploy     # aplica migrações, RLS e funções de autenticação
npm run start:dev             # API em http://localhost:3000, OpenAPI em /docs
```

## Testes

```bash
npm test                # unidade — sem rede, sem banco
npm run test:integration  # RLS/isolamento, idempotência, fluxos (requer DATABASE_URL_TEST)
npm run test:contract     # endpoints conforme contracts/openapi.yaml
npm run test:e2e          # integração + contrato
npm run test:smoke        # fumaça do catálogo externo — USA REDE, fora do fluxo padrão
```

`npm run test:smoke` valida a credencial e o contrato do provedor externo com chamadas reais. Ele
**não** roda em `npm test`, porque a suíte padrão precisa ser determinística e não depender de
terceiros — mas é a única verificação que pega credencial inválida ou mudança de contrato do
provedor, já que todo o resto usa fixtures.

`DATABASE_URL_TEST` é obrigatória para integração: sem ela a suíte **falha com mensagem explícita**
em vez de pular, porque o isolamento entre usuários é verificação obrigatória (Princípio I da
constituição em `.specify/memory/constitution.md`).

## Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Conexão principal da aplicação (role **sem** privilégios: é o que faz a RLS valer) |
| `DATABASE_URL_TEST` | Conexão usada só pelos testes de integração e carga |
| `MIGRATE_DATABASE_URL` | Conexão privilegiada, usada **apenas** por `prisma migrate deploy` |
| `TEST_MIGRATE_DATABASE_URL` | Conexão privilegiada do banco de teste (usada por inspeções fora da RLS) |
| `JWT_ACCESS_SECRET` | Segredo de assinatura do access token (`openssl rand -base64 48`) |
| `TMDB_API_KEY` | Read Access Token **v4** do TMDB (o valor longo que começa com `ey`), enviado no cabeçalho `Authorization` |
| `PORT` | Porta HTTP (padrão 3000) |
| `AUTH_RATE_LIMIT_TTL` | Janela da limitação de taxa das rotas de autenticação, em segundos |
| `AUTH_RATE_LIMIT_MAX` | Máximo de requisições por janela e por origem |

## Validação ponta a ponta

Os cenários C1–C7 (autenticação, perfil, progresso, episódio não liberado, isolamento entre
usuários, catálogo indisponível e encerramento de conta) estão em
[`specs/001-series-tracking/quickstart.md`](specs/001-series-tracking/quickstart.md).
