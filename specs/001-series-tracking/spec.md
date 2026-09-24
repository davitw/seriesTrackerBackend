# Feature Specification: Backend de Acompanhamento de Séries

**Feature Branch**: `001-series-tracking` (não criada — este diretório não é um repositório git)

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "Construa um backend que vai alimentar o frontend do SeriesTracker. Como usuário, eu quero poder me logar com e-mail e senha, procurar as minhas séries se elas não estiverem cadastradas no meu perfil e poder adicionar elas ao meu perfil. Com elas cadastradas no meu perfil eu quero poder listar elas e poder marcar os episódios que eu já vi, ver as que ainda faltam para assistir naquela temporada e se ainda não foram liberadas, quando serão."

## Clarifications

### Session 2026-09-23

- Q: Quando alguém tenta criar uma conta com um e-mail que já existe, a resposta deve dizer abertamente que aquele e-mail já está cadastrado, ou deve ocultar isso? → A: Opção B — manter a recusa explícita por e-mail existente e acrescentar limitação de taxa por origem nas rotas públicas de cadastro e entrada, mitigando a enumeração em massa.
- Q: Depois de quanto tempo sem usar o aplicativo uma pessoa deve precisar entrar de novo com a senha? → A: Opção A — 30 dias corridos sem nenhum uso; a credencial de acesso é curta e renovada automaticamente a cada uso.

## User Scenarios & Testing *(mandatory)*

<!--
  Nota sobre prioridades: as histórias estão ordenadas por dependência funcional, que aqui
  coincide com a ordem de entrega. A história P3 carrega o valor central do produto, mas não é
  demonstrável isoladamente sem as duas anteriores — o conjunto US1 + US2 + US3 constitui o MVP.
  Cada história permanece testável de forma independente usando dados de apoio (conta e perfil
  preexistentes) quando a anterior ainda não estiver pronta.
-->

### User Story 1 - Entrar na conta com e-mail e senha (Priority: P1)

Uma pessoa cria sua conta informando e-mail e senha, e depois entra com essas credenciais. A
sessão permanece válida entre aberturas do aplicativo até que a pessoa saia. Sem isso, nenhum dado
pode ser associado a alguém, e a lista de séries não tem dono.

**Why this priority**: é a porta de entrada e o pré-requisito de todo o resto — sem identidade não
existe "meu perfil", "minhas séries" nem "meu progresso". É a primeira fatia demonstrável
(cadastrar, entrar, sair) e habilita as demais.

**Independent Test**: criar uma conta nova, sair, entrar de novo com as mesmas credenciais e
confirmar acesso; tentar entrar com senha incorreta e confirmar recusa. Entrega valor verificável
sozinha.

**Acceptance Scenarios**:

1. **Given** um e-mail não cadastrado e uma senha com pelo menos 6 caracteres, **When** a pessoa se
   cadastra, **Then** a conta é criada e ela já pode entrar com essas credenciais.
2. **Given** uma conta existente, **When** ela informa e-mail e senha corretos, **Then** recebe
   acesso autenticado e esse acesso permanece válido nas próximas interações sem novo login.
3. **Given** uma conta existente, **When** ela informa senha incorreta, **Then** o acesso é negado
   com mensagem que não revela se o e-mail existe.
4. **Given** uma pessoa autenticada, **When** ela sai da conta, **Then** o acesso anterior deixa de
   ser aceito e uma nova entrada é exigida.
5. **Given** um cadastro, **When** o e-mail já pertence a outra conta ou a senha tem menos de 6
   caracteres, **Then** o cadastro é recusado com indicação do campo em falta.
6. **Given** uma pessoa autenticada, **When** ela encerra a própria conta, **Then** o acesso em uso
   deixa de valer, o login com as mesmas credenciais falha, e perfil, progresso e sessões deixam de
   existir.

---

### User Story 2 - Encontrar e adicionar séries ao meu perfil (Priority: P2)

Uma pessoa autenticada procura uma série pelo título — inclusive séries que ainda não estão no seu
perfil — e a adiciona. Depois consulta a lista das séries que acompanha. A busca acontece sobre um
catálogo de referência; o perfil guarda apenas as séries escolhidas.

**Why this priority**: sem séries no perfil não há episódios para marcar nem progresso para ver.
A entrega desta história já é útil por si: a pessoa passa a ter a lista centralizada das séries que
acompanha, que é o problema declarado do produto.

**Independent Test**: com uma conta existente, buscar um título conhecido, adicionar o resultado,
listar o perfil e confirmar que a série aparece; remover e confirmar que desaparece.

**Acceptance Scenarios**:

1. **Given** uma pessoa autenticada, **When** ela busca por um título que existe no catálogo,
   **Then** recebe correspondências com identificação suficiente para distinguir séries homônimas
   (título e ano de estreia).
2. **Given** um resultado de busca escolhido, **When** ela o adiciona ao perfil, **Then** a série
   passa a integrar sua lista e seus episódios ficam disponíveis para acompanhamento.
3. **Given** uma série já presente no perfil, **When** ela tenta adicioná-la novamente, **Then** o
   perfil permanece sem duplicata e nenhum progresso é perdido.
4. **Given** uma pessoa autenticada com séries no perfil, **When** ela lista suas séries, **Then**
   recebe todas as que acompanha, com indicação das acessadas mais recentemente em destaque.
5. **Given** uma série no perfil, **When** ela remove a série, **Then** a série deixa de integrar
   seu perfil e o progresso associado a ela deixa de ser apresentado.
6. **Given** uma busca por título inexistente, **When** o catálogo não retorna correspondências,
   **Then** ela recebe resposta explícita de "nada encontrado", sem criação de registro vazio.

---

### User Story 3 - Marcar episódios assistidos e acompanhar o progresso da temporada (Priority: P3)

Uma pessoa abre uma série do seu perfil, vê os episódios por temporada e marca como assistidos os
que já viu. Ela vê quantos episódios daquela temporada já assistiu, quantos faltam e, para os que
ainda não foram liberados, a data em que serão. Para episódios ainda não liberados não existe
marcação. Ela pode desmarcar um episódio marcado por engano.

**Why this priority**: é o valor central do produto — "eliminar a necessidade de lembrar em qual
episódio parei". Ocupa a terceira posição apenas porque depende de haver uma conta (US1) e uma
série no perfil (US2) para ser demonstrada de ponta a ponta.

**Independent Test**: com uma conta e uma série já adicionada ao perfil, marcar um episódio e
confirmar que o total de assistidos da temporada aumenta em um e que os faltantes diminuem; tentar
marcar um episódio com estreia futura e confirmar a recusa com a data informada.

**Acceptance Scenarios**:

1. **Given** uma série no perfil com temporadas e episódios carregados, **When** a pessoa abre a
   série, **Then** ela recebe os episódios agrupados por temporada, em ordem, com o estado de
   assistido de cada um.
2. **Given** um episódio já liberado e não assistido, **When** ela o marca como assistido,
   **Then** o estado passa a assistido, o momento da marcação é registrado e o progresso da
   temporada é atualizado.
3. **Given** um episódio com data de estreia no futuro, **When** ela tenta marcá-lo como assistido,
   **Then** a operação é recusada e ela é informada da data de liberação.
4. **Given** um episódio marcado por engano, **When** ela o desmarca, **Then** ele volta a contar
   como faltante e o progresso é atualizado.
5. **Given** uma temporada com episódios assistidos, **When** ela consulta o progresso, **Then**
   recebe o número de assistidos, o total da temporada e a quantidade de faltantes, todos coerentes
   com o conjunto de episódios marcados.
6. **Given** uma temporada com episódios ainda não liberados, **When** ela consulta o progresso,
   **Then** recebe a data do próximo episódio a ser liberado e os faltantes que já estão
   disponíveis.
7. **Given** episódios marcados fora de ordem cronológica (o quinto antes dos anteriores), **When**
   ela marca o quinto, **Then** a marcação é aceita sem exigir os anteriores.

---

### Edge Cases

- **Série buscada não existe no catálogo**: resposta explícita de ausência, sem criar série vazia no
  perfil e sem erro genérico.
- **Catálogo externo indisponível ou lento**: a busca informa indisponibilidade temporária; listar
  o perfil, consultar episódios já carregados, marcar e desmarcar continuam funcionando. Nenhuma
  operação do núcleo pode depender da disponibilidade do catálogo no momento da chamada.
- **Episódio sem data de estreia conhecida**: o episódio é tratado como não liberado e não pode ser
  marcado; a ausência de data é apresentada como "data a confirmar", não como data inválida.
- **Temporada inteira ainda não liberada**: progresso 0 de N com a data do primeiro episódio.
- **Temporada ou série sem episódios conhecidos**: a série aparece no perfil marcada como sem
  episódios disponíveis, sem contagem enganosa.
- **Série retomada após hiato/cancelamento**: novas temporadas ou episódios passam a aparecer sem
  ação da pessoa; datas já passadas deixam de ser tratadas como "a liberar".
- **Remover e readicionar uma série do perfil**: o descarte do progresso ao remover é o
  comportamento definido em FR-009.
- **Acesso de outra pessoa aos meus dados**: qualquer tentativa de ler ou alterar dados de outro
  usuário, mesmo conhecendo os identificadores, é recusada como inexistente.
- **Sessão expirada durante o uso**: a operação é recusada de forma que o aplicativo possa conduzir
  a pessoa a entrar novamente, sem perda silenciosa da ação.
- **Excesso de tentativas de cadastro ou entrada**: a partir do limite configurado por origem, as
  requisições passam a ser recusadas com indicação de excesso de requisições; quem opera dentro do
  limite não é afetado.
- **Retorno após longo período sem uso**: passados 30 dias corridos sem nenhum uso, a entrada com
  senha é exigida novamente; perfil e progresso permanecem intactos.
- **Abandono da conta**: o usuário pode encerrar a conta e seus dados deixam de existir (definido
  como escopo do MVP; ver Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir criar uma conta com e-mail e senha, exigindo senha de no
  mínimo 6 caracteres e recusando e-mail já utilizado por outra conta. A recusa por e-mail já
  cadastrado MUST ser explícita e distinguir-se das demais falhas de cadastro; essa revelação é
  decisão consciente do produto, mitigada pela limitação de taxa de FR-021.
- **FR-002**: O sistema MUST permitir autenticar-se com e-mail e senha e manter o acesso válido
  entre usos sucessivos até que haja saída explícita ou decurso de 30 dias corridos sem nenhum uso
  do aplicativo. A credencial de acesso MUST ter validade curta e ser renovada automaticamente
  enquanto houver uso dentro dessa janela, para que ninguém precise entrar de novo no meio do
  acompanhamento.
- **FR-003**: O sistema MUST recusar credenciais inválidas com mensagem que não revele a existência
  do e-mail informado.
- **FR-004**: O sistema MUST permitir encerrar a sessão, invalidando o acesso anterior.
- **FR-005**: O sistema MUST exigir sessão válida em toda operação sobre dados de usuário e MUST
  responder com indicação de não autorizado quando ela estiver ausente ou expirada.
- **FR-006**: O sistema MUST permitir buscar séries por título em um catálogo de referência,
  retornando correspondências com título e ano de estreia para desambiguação.
- **FR-007**: O sistema MUST permitir adicionar uma série do catálogo ao perfil do usuário e MUST
  tratar a operação como idempotente: repeti-la não cria duplicata, não altera o progresso
  existente e informa que a série já estava no perfil.
- **FR-008**: O sistema MUST permitir listar as séries do perfil, identificando as acessadas mais
  recentemente para destaque (as 5 mais recentes, conforme o alvo do produto).
- **FR-009**: O sistema MUST permitir remover uma série do perfil, descartando o progresso
  associado àquela série para aquele usuário.
- **FR-010**: O sistema MUST fornecer, para cada série do perfil, seus episódios agrupados por
  temporada e em ordem, com número de temporada, número de episódio, título e data de estreia.
- **FR-011**: O sistema MUST permitir marcar um episódio como assistido, registrando o momento da
  marcação, de forma idempotente.
- **FR-012**: O sistema MUST permitir desmarcar um episódio, removendo o registro de marcação.
- **FR-013**: O sistema MUST recusar a marcação de episódio cuja data de estreia esteja no futuro ou
  não seja conhecida, informando a data quando ela existir.
- **FR-014**: O sistema MUST fornecer, por temporada, a quantidade de episódios assistidos, o total
  de episódios e a quantidade de faltantes, derivados sempre do conjunto atual de marcações.
- **FR-015**: O sistema MUST informar, por temporada, o próximo episódio a ser liberado e a data
  prevista, quando houver, e MUST apresentar os episódios já liberados e não assistidos como
  faltantes.
- **FR-016**: O sistema MUST garantir que todo dado de usuário seja acessível apenas para a pessoa
  autenticada dona dele, em leitura e em escrita, inclusive quando o identificador de outro usuário
  é conhecido. Tentativas de acesso cruzado MUST ser tratadas como recurso inexistente. A garantia
  MUST valer também na camada de persistência, e não apenas no serviço: um erro na aplicação não
  pode expor dado de outra conta.
- **FR-017**: O sistema MUST armazenar localmente os metadados de séries, temporadas e episódios
  obtidos do catálogo, de forma que as séries já acompanhadas permaneçam consultáveis sem nova
  consulta ao catálogo externo.
- **FR-018**: O sistema MUST manter disponíveis as operações de listar perfil, consultar episódios
  já armazenados, marcar e desmarcar episódios quando o catálogo externo estiver indisponível,
  sinalizando a indisponibilidade apenas nas operações que dependem de consulta nova (busca e carga
  inicial de uma série).
- **FR-019**: O sistema MUST retornar erros com indicação estável e distinguível da causa (dado
  inválido, não autorizado, não encontrado, conflito, indisponibilidade de dependência externa), sem
  apresentar falha como sucesso. Os códigos estáveis estão catalogados em `contracts/errors.md`.
- **FR-020**: O sistema MUST permitir que a pessoa encerre a própria conta, tornando inacessíveis os
  dados pessoais e de progresso associados.
- **FR-021**: O sistema MUST limitar a taxa de requisições por origem nas rotas públicas de
  autenticação (cadastro e entrada), respondendo com indicação de excesso de requisições quando o
  limite for excedido, sem afetar quem opera dentro do limite.

### Key Entities *(include if feature involves data)*

- **Conta**: identidade da pessoa no produto; e-mail único como credencial, senha protegida, momento
  de criação. É a dona de todo dado de perfil e progresso.
- **Série de catálogo**: obra de referência obtida do catálogo externo; identificação no catálogo,
  título, ano de estreia, situação (em exibição, encerrada, cancelada) e temporadas. Armazenada
  localmente após a primeira consulta.
- **Série acompanhada**: vínculo entre uma conta e uma série de catálogo; registra quando foi
  adicionada e o momento do último episódio assistido dessa série, que determina a ordenação das
  mais recentes. Um mesmo par conta + série existe uma única vez.
- **Episódio**: unidade assistível de uma temporada de uma série; número de temporada, número de
  episódio, título e data de estreia. Data ausente ou futura significa não liberado.
- **Episódio assistido**: marcação de que uma conta assistiu a um episódio; registra o momento da
  marcação. Um mesmo par conta + episódio existe uma única vez.
- **Progresso de temporada**: visão derivada, não armazenada como valor próprio, composta de
  assistidos, total, faltantes e próximo episódio a liberar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma pessoa sem conta consegue criar a conta e entrar em menos de 2 minutos, sem ajuda
  externa.
- **SC-002**: A partir da lista de séries, uma pessoa encontra e adiciona um título conhecido em
  menos de 60 segundos e no máximo 3 interações.
- **SC-003**: Ao marcar um episódio, o progresso da temporada exibido já reflete a marcação na
  primeira consulta seguinte, sem atualização manual e sem divergência entre a lista de episódios e
  o total apresentado.
- **SC-004**: Em 100% das consultas de progresso, o número de assistidos é exatamente igual ao
  número de episódios marcados daquela temporada, e assistidos + faltantes = total de episódios
  liberados da temporada.
- **SC-005**: 100% das buscas por títulos existentes devolvem as correspondências recebidas do
  provedor sem perda nem embaralhamento — identificador, título e ano de estreia preservados. O
  **ranqueamento é do provedor externo** e não é garantido por este serviço.
- **SC-006**: Em 100% das tentativas de acessar dado de outra conta, mesmo com identificadores
  corretos, o dado não é exposto nem alterado.
- **SC-007**: Com o catálogo externo indisponível, 100% das operações de listar perfil, consultar
  séries já acompanhadas, marcar e desmarcar episódios continuam concluindo com sucesso.
- **SC-008**: Uma pessoa identifica, sem sair da tela da série, quantos episódios faltam na temporada
  atual e quando ocorre a próxima liberação, em 90% dos casos de uso observados.
- **SC-009**: O sistema sustenta 1.000 contas ativas, cada uma com até 50 séries acompanhadas e
  5.000 episódios por série, mantendo as consultas de listagem e progresso perceptivelmente
  imediatas (abaixo de 1 segundo) em condições normais de operação.
- **SC-010**: Nenhuma operação do núcleo é perdida silenciosamente: quando uma ação é recusada, a
  pessoa recebe indicação do motivo em 100% dos casos.
- **SC-011**: 100% das requisições que excedem o limite configurado nas rotas públicas de
  autenticação são recusadas com indicação de excesso de requisições, e nenhuma pessoa que opera
  dentro do limite é afetada por isso.
- **SC-012**: Uma pessoa que usa o aplicativo ao menos uma vez a cada 30 dias nunca precisa entrar
  novamente com a senha por expiração; após 30 dias corridos sem nenhum uso, a entrada com senha
  passa a ser exigida em 100% dos casos.

## Assumptions

- **Cadastro incluído no escopo**: a pessoa cria a própria conta com e-mail e senha; o PRD prevê
  "criar uma conta" e a descrição da funcionalidade cita o login — assume-se o fluxo completo
  (cadastro, entrada, saída).
- **Sem verificação de e-mail obrigatória no MVP**: a conta entra em uso imediatamente após o
  cadastro; verificação de e-mail fica para depois da validação de mercado.
- **Sem login social no MVP**: apenas e-mail e senha, conforme alvo do produto.
- **Senha mínima de 6 caracteres e sessão persistente até a saída**: regras herdadas do alvo do
  produto.
- **Parâmetros de sessão**: a sessão sobrevive enquanto houver uso dentro de 30 dias corridos. Os
  valores exatos de validade da credencial de acesso e da credencial de renovação são parâmetros de
  configuração, definidos no plano, e não regra de negócio desta especificação.
- **Catálogo externo como fonte única de metadados**: o produto não cria séries nem episódios
  manualmente; a escolha do catálogo e a forma de consulta são decisões de planejamento, não desta
  especificação.
- **Metadados são armazenados localmente após a primeira consulta** e reaproveitados; a atualização
  de dados de séries em exibição pode ocorrer de forma periódica, sem bloquear o uso.
- **Progresso nunca é editado diretamente**: só existe como consequência de marcar ou desmarcar
  episódios, e é sempre derivado dessas marcações no momento da leitura.
- **Episódios não liberados não são marcáveis**, e a data de liberação é a informação apresentada no
  lugar da marcação.
- **Remover uma série do perfil**: a regra de descarte do progresso é a de FR-009, não uma premissa
  à parte.
- **Dados de data/hora são registrados de forma normalizada** e apresentados no fuso da pessoa; a
  data de estreia é um dia de calendário, sem horário.
- **Encerramento de conta incluído no MVP**: a pessoa pode encerrar a própria conta e os dados
  pessoais e de progresso deixam de existir (não apenas ficam inacessíveis).
- **Fora de escopo neste MVP**: notificações push, estatísticas, temas, recursos ilimitados do plano
  premium, recursos sociais, recomendações, reprodução de vídeo, gamificação e controle parental.
- **Escala do MVP**: produto em validação de mercado, com ordem de grandeza de milhares de contas —
  a meta quantitativa está em SC-009.
- **Dependência**: existe um catálogo externo de metadados de séries com busca por título, temporadas,
  episódios e datas de estreia; sem ele a busca e a carga inicial de séries não operam, mas o
  acompanhamento das séries já carregadas continua (FR-018).
- **Dependência**: este backend é a única fonte de dados do aplicativo cliente existente
  (`frontend/`), que consome as operações descritas em FR-001 a FR-020.
- **A existência de uma conta é revelada no cadastro**: a recusa por e-mail já cadastrado confirma
  que aquele e-mail tem conta. É escolha consciente do produto — a pessoa descobre na hora, em vez
  de esperar um aviso que pode não chegar — e é coerente com a ausência de verificação de e-mail no
  MVP. A mitigação é a limitação de taxa (FR-021); a entrada continua sem revelar (FR-003).
- **Pendência herdada da constituição**: o item `TODO(TECH_STACK_BACKEND)` registrado em
  `.specify/memory/constitution.md` (definição do runtime do serviço) precisa ser resolvido antes de
  `/speckit-plan`; esta especificação foi escrita de forma independente dessa escolha.
