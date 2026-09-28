# Phase 0 — Research: Conteúdo de Descoberta na Home

**Feature**: `002-home-discovery` | **Date**: 2026-09-28

Todos os pontos em aberto do Technical Context estão resolvidos. Não restam `NEEDS
CLARIFICATION`.

---

## R-001 — Onde os itens das listas vivem

**Decision**: os itens de lista são **autocontidos**. `catalog_list_items` guarda o identificador
do provedor, o título, o ano de estreia e a imagem — e **não** referencia a tabela `series`.

**Rationale**: este é o ponto de design da feature, e a razão é uma invariante.

A tabela `series` hoje contém apenas séries **completas**: toda linha tem temporadas e episódios,
porque só entra ali quando alguém adiciona a série ao perfil e o serviço carrega os detalhes. É
essa invariante que faz `GET /v1/series/{id}` funcionar — e é ela que o `ensureCached` assume
quando encontra uma série em cache e devolve o identificador sem carregar nada.

Se as listas referenciassem `series`, elas precisariam inserir séries ali só com o resumo (a
resposta de lista não traz temporadas). A invariante se quebraria: passaria a existir linha em
`series` sem episódios. E aí, ao adicionar essa série ao perfil, `ensureCached` encontraria o
"cache-hit" e devolveria o identificador — **resultando numa série sem episódios, sem nenhum erro
aparecer**. É exatamente o caso que o `FR-008` e o caso limite correspondente proíbem.

Com itens autocontidos, a série só entra em `series` pelo caminho de sempre — o da adição ao
perfil, que carrega os detalhes completos. Nenhuma linha incompleta é criada, a invariante se
mantém, e `FR-008` é satisfeito **sem tocar em código existente**.

O caso de a série já estar em `series` (porque alguém a adicionou antes) também funciona: a lista
guarda o identificador do provedor, e a adição resolve pelo caminho normal, encontrando a série
completa.

**Alternatives considered**:
- *Referenciar `series` por chave estrangeira*: obrigaria a inserir séries resumidas e quebraria a
  invariante descrita acima — a menos que se alterasse o `ensureCached` para verificar completude,
  o que adiciona uma consulta em todo cache-hit do caminho quente para cobrir um caso que existe só
  por causa desta escolha.
- *Guardar as listas apenas em memória*: perderia o conteúdo a cada reinício e não sustentaria
  `SC-003` (home servida com o provedor fora do ar).

---

## R-002 — Forma do endpoint

**Decision**: um único endpoint, `GET /v1/catalog/lists`, devolvendo todas as listas de uma vez.

**Rationale**: a home precisa de todas elas na mesma tela. Três requisições para desenhar uma tela
é pior para o cliente (três latências, três estados de erro) e não traz benefício — as listas são
pequenas, vêm do cache local e não são paginadas.

**Alternatives considered**: um endpoint por lista (`/lists/popular`) — permitiria buscar uma lista
isolada, mas exigiria três chamadas na home e três caminhos de degradação para tratar. Se a
necessidade aparecer, um filtro `?keys=` resolve sem quebrar o contrato.

---

## R-003 — Quais listas e quantos itens

**Decision**: três listas — populares, em exibição e mais bem avaliadas — com vinte itens cada.

**Rationale**: vinte é o tamanho de uma página do provedor, então uma requisição por lista resolve,
sem paginação. Três listas preenchem uma home com variedade suficiente para o propósito declarado
(haver o que ver no primeiro acesso) sem transformar a tela num catálogo.

**Alternatives considered**: mais listas (tendências do dia, por gênero, por provedor) — a spec
deixa isso fora de escopo, e cada lista adicional é mais uma chamada no job e mais uma decisão de
produto sobre ordenação na tela.

---

## R-004 — Atualização, e o que acontece na primeira vez

**Decision**: a atualização roda no **job agendado que já existe** (diário, 3h), estendido. E o
endpoint, ao encontrar a lista **nunca sincronizada**, busca no provedor naquele momento e guarda.

**Rationale**: sem o segundo comportamento haveria um vazio depois de todo deploy — o banco novo não
tem listas, o job só roda de madrugada, e a home de quem entrar nesse intervalo fica vazia. Isso
seria a feature falhando exatamente no cenário que ela existe para cobrir.

O comportamento cobre, então, três situações distintas:

| Estado do cache | Provedor | Resposta |
|---|---|---|
| Preenchido | disponível ou fora | conteúdo do cache (FR-005, SC-003) |
| Vazio (nunca sincronizado) | disponível | busca agora, guarda e devolve |
| Vazio | fora | indisponibilidade explícita (FR-006) |

**Alternatives considered**: buscar sempre ao vivo quando o cache tem mais de X horas — acrescenta
latência de rede à abertura da home e reintroduz a dependência que `FR-005` proíbe. Um job que roda
a cada hora: mais chamadas ao provedor sem ganho perceptível, já que destaques não mudam de hora em
hora.

---

## R-005 — Mapeamento e validação da resposta de lista

**Decision**: um schema de validação próprio para a resposta de lista, no mesmo módulo de schemas
já existente, com os mesmos campos de resumo usados pela busca.

**Rationale**: a resposta de uma lista e a de uma busca têm a mesma forma de item, mas contratos
diferentes — a busca tem termo e paginação, a lista tem página e total. Compartilhar o schema de
item e separar o de envelope evita que uma mudança numa operação quebre a outra silenciosamente.

Campo ausente ou de tipo inesperado continua virando erro explícito, como no resto do adapter
(Princípio II).

**Alternatives considered**: reusar o schema de busca inteiro — acoplaria duas operações
independentes do provedor; aceitar a resposta sem validar — contraria o princípio e já se mostrou o
tipo de decisão que produz defeito silencioso.

---

## R-006 — Como a degradação é decidida

**Decision**: a decisão vem do **conteúdo disponível**, não do estado do provedor. O serviço tenta
o cache primeiro; só consulta o provedor se o cache estiver vazio; só responde indisponibilidade se
o provedor falhar **e** não houver nada guardado.

**Rationale**: é o que torna `FR-005` e `FR-006` verificáveis. O cliente distingue as duas
situações por respostas diferentes — `200` com listas (possivelmente vazias, se o provedor
realmente não tem destaques) contra `503 CATALOG_UNAVAILABLE` (não foi possível obter). Uma lista
vazia vinda do provedor é sucesso; a impossibilidade de obter é falha.

**Alternatives considered**: devolver a lista vazia quando o provedor falha — é o erro que a spec
proíbe explicitamente, porque faz a pessoa acreditar que não há destaques quando o problema é
outro.

---

## R-007 — Não-regressão das operações existentes

**Decision**: nenhum código do caminho atual é alterado. A feature adiciona tabelas, um endpoint, um
método no adapter e uma etapa no job; o `ensureCached`, os repositórios de perfil e o serviço de
progresso ficam intactos.

**Rationale**: `FR-010` e `SC-005` exigem que nada mude. Alterar zero linhas do caminho existente é
a forma mais forte de garantir isso — e é possível precisamente por causa de R-001.

**Alternatives considered**: alterar o `ensureCached` para verificar completude — desnecessário com
itens autocontidos, e adicionaria uma consulta a mais em todo cache-hit do caminho quente para
proteger contra um estado que o desenho não cria.
