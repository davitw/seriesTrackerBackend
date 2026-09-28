# Feature Specification: Conteúdo de Descoberta na Home

**Feature Branch**: `002-home-discovery` (não há branch separada — o trabalho vai em `main`)

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "Não temos nenhuma chamada para preencher a home. Para chegar na home precisa estar logado — por isso a ideia de ter algo na home caso seja o primeiro acesso do usuário, e daí a necessidade desses novos endpoints."

## Contexto

A home do aplicativo exige sessão válida. Só que quem acabou de criar a conta ainda não
adicionou nenhuma série — e uma tela inicial vazia não comunica o que o produto faz nem oferece
caminho para começar. Sem nada para ver, o primeiro acesso é um beco.

Esta feature existe para eliminar esse estado vazio: a home passa a oferecer uma seleção de séries
em destaque, para que sempre haja conteúdo e um caminho para o primeiro acompanhamento.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Encontrar séries para acompanhar quando não acompanho nenhuma (Priority: P1)

Uma pessoa cria a conta, entra, e chega na home sem nenhuma série no perfil. Em vez de uma tela
vazia, ela encontra uma seleção de séries em destaque — as mais populares no momento, as que estão
em exibição e as mais bem avaliadas — com título, ano de estreia e imagem, suficiente para decidir
o que assistir.

**Why this priority**: é o problema que motivou a feature. Sem isso, o primeiro acesso não tem
saída: a pessoa não sabe o que o aplicativo faz nem como começar a usá-lo.

**Independent Test**: criar uma conta nova, entrar e abrir a home sem adicionar nada. As listas
devem aparecer preenchidas, cada uma identificada, e seus itens devem ser suficientes para escolher
uma série.

**Acceptance Scenarios**:

1. **Given** uma pessoa autenticada sem nenhuma série no perfil, **When** ela abre a home,
   **Then** recebe as listas de séries em destaque, cada uma com identificação própria.
2. **Given** uma lista de destaques, **When** ela examina um item, **Then** encontra título, ano de
   estreia e referência de imagem, além do identificador necessário para adicioná-la ao perfil.
3. **Given** a home aberta, **When** ela adiciona uma série a partir de uma lista, **Then** a série
   passa a integrar o perfil **com os episódios disponíveis para acompanhamento**, sem precisar de
   nenhuma ação adicional.
4. **Given** uma série que já está no perfil e aparece em uma lista, **When** ela tenta adicioná-la
   de novo, **Then** nada é duplicado e o progresso existente é preservado.
5. **Given** uma pessoa sem sessão válida, **When** ela tenta acessar as listas, **Then** o acesso é
   recusado.

---

### User Story 2 - Continuar vendo destaques com o provedor de catálogo fora do ar (Priority: P2)

As listas vêm de um provedor externo. Quando ele está indisponível, a home não pode ficar vazia:
a pessoa continua vendo o último conteúdo conhecido.

**Why this priority**: o valor da US1 é justamente ter conteúdo disponível. Uma home que depende
do provedor para responder deixa de cumprir o propósito exatamente quando a pessoa mais precisa —
no primeiro acesso. É a mesma lógica que já vale para as séries acompanhadas.

**Independent Test**: carregar as listas uma vez, tornar o provedor indisponível e abrir a home de
novo. As listas devem continuar sendo servidas com o conteúdo anterior.

**Acceptance Scenarios**:

1. **Given** que as listas já foram obtidas alguma vez, **When** o provedor externo está
   indisponível, **Then** a home continua apresentando o último conteúdo conhecido.
2. **Given** que as listas nunca foram obtidas, **When** o provedor externo está indisponível,
   **Then** a resposta informa indisponibilidade de forma explícita, em vez de apresentar uma lista
   vazia como se não houvesse destaques.
3. **Given** que o provedor externo voltou, **When** a atualização periódica ocorre, **Then** as
   listas passam a refletir o conteúdo novo.

---

### Edge Cases

- **Destaques genuinamente vazios**: o provedor responde com uma lista sem itens. Isso é diferente
  de indisponibilidade e deve ser apresentado como "sem destaques no momento", sem erro.
- **Destaques incompletos**: o provedor devolve menos itens que o esperado. A home apresenta o que
  veio, sem preencher com repetições nem falhar.
- **Série da lista removida do catálogo**: uma série em destaque deixa de existir no provedor. A
  lista continua apresentando as demais; a série que sumiu deixa de aparecer na próxima atualização.
- **Adicionar série que veio de uma lista e cujo detalhe falha**: a adição informa a
  indisponibilidade e nada é gravado pela metade — a série não entra no perfil sem os episódios.
- **Primeira execução (listas nunca obtidas)**: a primeira abertura da home depende do provedor;
  se ele estiver fora nesse momento, vale o cenário 2 da US2.
- **Sessão expirada**: a tentativa de abrir a home é recusada de forma que o aplicativo possa
  conduzir a pessoa a entrar novamente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer, para pessoas autenticadas, listas de séries em destaque
  distintas e identificáveis — no mínimo: populares, em exibição e mais bem avaliadas.
- **FR-002**: Cada item de lista MUST trazer informação suficiente para a escolha: título, ano de
  estreia, referência de imagem e o identificador necessário para adicionar a série ao perfil.
- **FR-003**: O acesso às listas MUST exigir sessão válida, com a mesma resposta de recusa usada nas
  demais rotas autenticadas.
- **FR-004**: Cada lista MUST ter tamanho delimitado e uma ordem definida pelo provedor, preservada
  sem reordenação pelo serviço.
- **FR-005**: O conteúdo das listas MUST permanecer disponível quando o provedor externo estiver
  indisponível, servido a partir da última obtenção bem-sucedida.
- **FR-006**: Quando não houver conteúdo algum disponível **e** o provedor estiver indisponível, a
  resposta MUST distinguir indisponibilidade de ausência de destaques, informando
  indisponibilidade.
- **FR-007**: Uma lista devolvida vazia pelo provedor MUST ser apresentada como ausência de
  destaques no momento, sem erro.
- **FR-008**: Adicionar ao perfil uma série obtida de uma lista MUST comportar-se como qualquer
  outra adição: idempotente (repetir não duplica e não apaga progresso) e resultando em **episódios
  disponíveis para acompanhamento**.
- **FR-009**: O sistema MUST atualizar o conteúdo das listas periodicamente, de modo que destaques
  novos apareçam sem ação da pessoa.
- **FR-010**: As listas MUST NOT interferir nas operações existentes: listar o perfil, buscar por
  título, abrir uma série, marcar e desmarcar episódios e consultar progresso permanecem com o
  comportamento atual.

### Key Entities *(include if feature involves data)*

- **Destaque**: posição de uma série dentro de uma lista, em um momento. Representa "esta série
  aparece nesta lista, nesta ordem". Um mesmo par lista + série não se repete enquanto a lista
  vigora.
- **Lista de destaques**: conjunto nomeado e identificável de séries em destaque (populares, em
  exibição, mais bem avaliadas), com a ordem vigente e o momento da última atualização bem-sucedida.
- **Série em destaque**: o resumo de uma série do catálogo (título, ano de estreia, imagem). Pode
  já existir no catálogo local — inclusive completa, com temporadas e episódios, caso alguém já a
  tenha adicionado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das pessoas autenticadas encontram conteúdo na home, mesmo sem nenhuma série no
  perfil — o estado vazio deixa de existir.
- **SC-002**: As listas de destaques chegam em menos de 1 segundo em condições normais de operação.
- **SC-003**: Com o provedor de catálogo indisponível, 100% das aberturas de home servem o último
  conteúdo conhecido, desde que ele já tenha sido obtido alguma vez.
- **SC-004**: Adicionar uma série a partir da home resulta em episódios disponíveis em 100% dos
  casos, sem nenhuma ação adicional da pessoa.
- **SC-005**: Nenhuma operação existente muda de comportamento: perfil, busca, detalhes, marcação e
  progresso continuam com os mesmos resultados e a mesma ordem de latência.
- **SC-006**: Indisponibilidade do provedor é distinguível de ausência de destaques em 100% dos
  casos — a pessoa nunca é levada a acreditar que não há destaques quando o problema é outro.

## Assumptions

- **A home exige sessão válida** — confirmado pelo dono do produto. Não há home pública nem
  conteúdo de descoberta para quem não entrou.
- **O conteúdo vem do catálogo externo** já usado pela busca: mesma fonte, mesma credencial, mesma
  fronteira de acesso.
- **O propósito é o primeiro acesso**, mas a decisão de exibir as listas quando a pessoa *já* tem
  séries no perfil é do aplicativo cliente — o serviço apenas oferece o conteúdo, e não impõe
  quando ele deve aparecer.
- **As listas são cacheadas localmente** e atualizadas periodicamente, em vez de consultadas a cada
  abertura. É o que sustenta FR-005 e SC-003, e evita transformar cada abertura de home em uma
  chamada a um serviço de terceiros.
- **Apenas o resumo é armazenado nas listas.** Temporadas e episódios continuam sendo carregados
  sob demanda, quando a série é adicionada ao perfil.
- **"Melhores avaliadas" e "populares" refletem o provedor**, não uma avaliação própria. O serviço
  não pontua, ordena nem filtra o que recebe (mesma decisão já registrada para a busca).
- **Três listas são suficientes para o propósito.** A inclusão de outras (tendências do dia, por
  gênero, por provedor de streaming) fica fora desta feature.
- **Fora de escopo**: recomendação personalizada, histórico de exibição, categorias por gênero e
  qualquer forma de destaque pago ou editorial.
