# Constituição do Series Tracker Backend

## Core Principles

### I. Isolamento de Dados por Usuário (NON-NEGOTIABLE)

Todo dado pertencente a um usuário MUST ser lido e escrito apenas no escopo do `user_id`
autenticado. Nenhuma rota pode devolver, alterar ou contar registros de outro usuário.

- Toda tabela que armazena dados de usuário MUST ter Row Level Security habilitada, com política
  por operação (SELECT/INSERT/UPDATE/DELETE). Políticas `USING (true)` são proibidas para dados de
  usuário.
- Toda referência a `auth.users(id)` MUST declarar `ON DELETE CASCADE`, para que exclusão de conta
  não deixe órfãos.
- A chave de service role do banco MUST NOT aparecer em código cliente, repositório, log ou
  resposta de API.
- Acesso a recurso de outro usuário MUST responder 404 (não 403), para não confirmar existência.

**Rationale**: vazamento entre contas é o único defeito irreversível deste produto — ele destrói a
confiança do usuário e não tem correção posterior. A fronteira de autorização é o que precisa estar
correta, não a rota.

**Verificação obrigatória**: para cada recurso novo, um teste de integração autenticado como usuário
A tentando ler e escrever recurso do usuário B, esperando 404. Sem esse teste, o recurso não entra.

### II. Fronteira Externa Isolada (TMDB)

O TMDB é a única fonte de metadados de séries, temporadas e episódios. O acesso a ele MUST ficar
atrás de um único módulo adapter; nenhuma chamada HTTP direta ao TMDB pode existir em controllers ou
em lógica de domínio.

- Toda resposta do TMDB MUST ser validada e mapeada para o modelo interno antes de ser persistida.
  Campos ausentes ou com tipo inesperado MUST ser tratados explicitamente, nunca propagados como
  nulos silenciosos.
- Falha, timeout ou rate limit do TMDB MUST degradar para os dados já cacheados localmente. O fluxo
  de acompanhamento do usuário (marcar episódio, ver progresso) MUST continuar funcionando com o
  provedor externo indisponível.
- A credencial do TMDB MUST vir de variável de ambiente e MUST NOT ser registrada em log nem
  exposta ao cliente.
- Metadados são cacheados localmente. Testes de unidade e integração MUST NOT tocar a rede: use
  fixtures gravadas ou um duplo do adapter.

**Rationale**: o produto depende de um terceiro que o time não controla. Se o TMDB for tratado como
dependência síncrona obrigatória do núcleo, toda indisponibilidade dele vira indisponibilidade do
produto.

### III. Test-First (NON-NEGOTIABLE)

Testes são escritos antes da implementação: primeiro o teste que falha, depois o código que o faz
passar, depois a refatoração. Nenhum comportamento novo é considerável concluído sem um teste que o
exercite na camada que detém a regra.

- Regras de autorização (Princípio I), cálculo de progresso (Princípio IV) e mapeamento de dados
  externos (Princípio II) MUST ter cobertura obrigatória.
- Testes MUST ser determinísticos: sem dependência de rede, sem relógio real não controlado, sem
  dependência de ordem de execução ou de estado compartilhado entre casos.
- Um teste que passa apenas por não exercitar o caminho real (mock do próprio objeto sob teste) MUST
  ser corrigido, não aceito.
- Quando um defeito é corrigido, o teste que reproduz o defeito MUST preceder a correção.

**Rationale**: as duas áreas de maior risco — fronteira de autorização e derivação de progresso —
são exatamente as que não falham de forma visível em teste manual.

### IV. Progresso Derivado, Nunca Duplicado

O estado persistido de um episódio assistido (par usuário + episódio) é a única fonte de verdade
sobre progresso. Contadores agregados (assistidos/total por temporada, total da série) MUST ser
derivados por consulta no momento da leitura.

- Campo de contagem desnormalizado só é permitido com medição de performance que o justifique e um
  teste que prove a consistência com a fonte de verdade.
- Marcar episódio como assistido MUST ser idempotente: repetir a operação não cria duplicata nem
  altera o resultado, e MUST registrar o momento (`watched_at`).
- Desmarcar MUST limpar o estado de assistido e o `watched_at` correspondente.
- Episódio com data de estreia futura MUST NOT ser aceito como assistido: a API MUST rejeitar a
  operação com 422 e mensagem que identifique o episódio e a data.
- A ordenação "últimas N séries acessadas" MUST derivar do último evento de progresso registrado,
  não de um campo mantido manualmente por outra rota.

**Rationale**: o progresso é a informação que o usuário confere para decidir se continua assistindo.
Uma divergência entre a lista de episódios e o contador exibido é indistinguível de perda de dados
do ponto de vista de quem usa.

### V. Simplicidade e Observabilidade do MVP

O escopo deste repositório é o descrito no PRD vigente. Reprodução de vídeo, recursos sociais,
recomendações, gamificação e notificações push estão fora do MVP e só entram por emenda a esta
constituição.

- Toda mudança de schema MUST ser uma migração versionada e revisada em conjunto com o código que a
  usa. Alteração manual de schema é proibida.
- Logs MUST ser estruturados (JSON) e conter identificador de requisição, `user_id` quando
  autenticado e um código de erro estável. Tokens, senhas e chaves MUST NOT ser registrados.
- Erros MUST usar código estável e status HTTP significativo. Resposta 200 com erro embutido no
  corpo é proibida.
- Timestamps MUST ser armazenados em UTC (`TIMESTAMPTZ`); datas de calendário (estreia de episódio)
  são datas puras, sem fuso.
- Toda complexidade adicional (cache, fila, contador desnormalizado, nova camada) MUST ser
  justificada por requisito mensurável antes da implementação.

**Rationale**: o objetivo do MVP é validar interesse de mercado. Cada camada prematura atrasa o
sinal que justifica o produto, e um log sem correlação torna o incidente mais caro que o defeito.

## Restrições Técnicas e de Segurança

Stack do serviço, decidida pelo mantenedor do projeto em 2026-09-23:

- **Runtime**: Node.js com TypeScript, framework de serviço NestJS, API REST versionada.
- **Banco**: PostgreSQL, hospedado no Supabase e acessado pelo serviço por conexão direta.
- **Metadados externos**: TMDB API — única fonte de séries, temporadas, episódios e datas de
  estreia.
- **Modelo de dados**: `users` (contas), `refresh_tokens` (sessões renováveis), `series` (cache do
  TMDB), `seasons`, `episodes` (cache de episódios com `air_date`), `user_series` (lista do usuário
  + ordenação), `user_episode_progress` (estado de assistido por usuário e episódio).

Regras aplicáveis a todas as camadas:

- Toda rota que lê ou escreve dado de usuário exige sessão válida. Não existem rotas anônimas para
  dados de usuário.
- Segredos (segredo de assinatura de credencial, chave do TMDB, credenciais de banco) vêm
  exclusivamente de variáveis de ambiente, com valores de desenvolvimento fora do controle de
  versão.
- Timestamps MUST ser armazenados em UTC; datas de calendário (estreia de episódio) são datas
  puras, sem fuso.

### Autenticação de Usuário

Como a pessoa se autentica neste serviço, em regras verificáveis:

- **Cadastro**: e-mail e senha. A senha MUST ter no mínimo 6 caracteres e MUST ser armazenada
  apenas como derivação resistente a força bruta (`argon2id`); o valor original MUST NOT ser
  persistido nem registrado em log.
- **Entrada**: e-mail e senha. A recusa MUST ser idêntica para e-mail inexistente e senha
  incorreta, de modo a não confirmar a existência de uma conta.
- **Credencial de acesso**: JWT assinado pelo próprio serviço, contendo a identificação do usuário e
  validade curta; o segredo de assinatura vem de variável de ambiente. Toda operação sobre dado de
  usuário MUST exigir credencial de acesso válida, e a ausência, expiração ou invalidade dela MUST
  ser respondida como não autorizado.
- **Credencial de renovação**: valor opaco de alta entropia, com validade longa, armazenado apenas
  como hash, rotacionado a cada uso e revogado na saída. A apresentação de uma credencial de
  renovação já rotacionada MUST revogar a família e ser recusada.
- **Saída**: MUST revogar a credencial de renovação apresentada; a sessão anterior deixa de ser
  aceita.
- **Encerramento de conta**: MUST tornar inacessíveis perfil, progresso e todas as sessões ativas.
- **Integração com o Princípio I**: a autenticação identifica a pessoa, mas não substitui a
  autorização. O isolamento de dados por usuário continua MUST ser garantido também na camada de
  persistência, conforme o Princípio I.
- **Escopo de autenticação**: a autenticação é responsabilidade do serviço, não delegada a
  fornecedor externo. Login social, verificação de e-mail obrigatória e recuperação de senha estão
  fora do MVP; a inclusão de qualquer um deles exige emenda a esta constituição.

## Fluxo de Desenvolvimento e Portões de Qualidade

Portões que toda mudança MUST satisfazer antes de ser considerada concluída:

1. A suíte de testes passa, com o teste escrito antes da implementação correspondente.
2. Mudança de schema acompanha uma migração versionada no mesmo conjunto de mudanças.
3. Recurso novo expõe dado de usuário acompanha teste de isolamento entre usuários (Princípio I).
4. O diff não contém segredo, credencial ou chave de API.
5. Mudança que altera contrato de API atualiza a spec ou o contrato correspondente na mesma
   entrega.

Toda revisão MUST verificar conformidade com os princípios desta constituição. Violação exige
justificativa explícita registrada na revisão e aprovação do mantenedor do projeto — não é aceita
por omissão. Complexidade que não atende a um requisito mensurável MUST ser removida.

## Governance

Esta constituição supersede outras práticas e convenções do projeto. Quando um requisito, plano ou
tarefa conflitar com um princípio aqui definido, o artefato conflitante MUST ser ajustado — não o
princípio.

- **Procedimento de emenda**: proposta escrita descrevendo a mudança e sua motivação, análise do
  impacto nos artefatos vigentes (spec, plan, tasks, código), aprovação do mantenedor do projeto,
  incremento de versão e registro no Sync Impact Report.
- **Política de versionamento** (semântica):
  - MAJOR: remoção ou redefinição incompatível de princípio ou regra de governança.
  - MINOR: novo princípio, nova seção ou expansão material de orientação existente.
  - PATCH: esclarecimento, correção de redação ou refinamento sem mudança semântica.
- **Revisão de conformidade**: cada revisão de mudança verifica os princípios aplicáveis. Emendas de
  governança e mudanças de escopo MUST citar o princípio afetado.
- **Derivações**: conflito entre esta constituição e qualquer outro documento do projeto resolve-se
  em favor desta constituição, com o documento conflitante corrigido na mesma entrega.
- Guia de desenvolvimento em tempo de execução: PRD vigente do projeto (`series_tracker_mvp_prd.md`)
  e a especificação técnica associada.

**Version**: 1.1.0 | **Ratified**: 2026-09-23 | **Last Amended**: 2026-09-23
