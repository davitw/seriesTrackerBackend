# Checklist de Requisitos de Segurança: Backend de Acompanhamento de Séries

**Purpose**: Validar se os requisitos de segurança da feature estão completos, claros, consistentes
e verificáveis antes da implementação — isolamento entre usuários, autenticação, ciclo de vida de
credenciais, superfície HTTP e resposta a falhas.
**Created**: 2026-09-23
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) | [data-model.md](../data-model.md) | [contracts/](../contracts/)

**Note**: Este checklist foi gerado pelo `/speckit-checklist` a partir do pedido "security" e do
contexto da feature. Os itens avaliam a **redação dos requisitos**, não o comportamento do sistema.
**Review Ownership**: artefato de revisão pertencente ao revisor. Marque `[x]` apenas quando o
critério de qualidade do requisito estiver satisfeito.
**Marker Semantics**: `[x]` significa requisito revisado e satisfatório — não significa trabalho de
implementação concluído.

## Completude — Autorização e isolamento entre usuários

- [ ] CHK001 Está explicitado quais dados são escopados ao usuário autenticado, cobrindo todas as entidades com estado pessoal (perfil, séries acompanhadas, progresso, sessões)? [Completeness, Spec §FR-016]
- [ ] CHK002 A resposta para acesso a recurso de outro usuário está definida de forma inequívoca, incluindo a escolha deliberada entre negar com 403 e ocultar com 404? [Clarity, Spec §FR-016, contracts/errors.md]
- [ ] CHK003 A exigência de negação de acesso cruzado está declarada tanto para leitura quanto para escrita, incluindo remoção e marcação idempotente? [Coverage, Spec §FR-016]
- [ ] CHK004 Está definido o comportamento quando o identificador é válido mas o recurso pertence a outra série do mesmo usuário, distinguindo isso do caso "recurso de outro usuário"? [Clarity, Spec §FR-016, contracts/errors.md]
- [ ] CHK005 O requisito de inacessibilidade a dados de usuário está enunciado para a camada de persistência, ou apenas para a camada de aplicação? [Gap, Constitution §I]
- [ ] CHK006 Está documentado se credenciais administrativas do banco podem ser alcançáveis pela superfície da API, e como isso é impedido? [Gap, Constitution §I]

## Completude — Autenticação e ciclo de vida da sessão

- [ ] CHK007 Está definida a validade temporal do credencial de acesso e o comportamento esperado do cliente quando ele expira? [Completeness, Spec §FR-002]
- [ ] CHK008 Está definido o comportamento quando um credencial de renovação já utilizado é apresentado novamente (reuso)? [Gap]
- [ ] CHK009 Há requisito para revogação de todas as sessões ativas em troca de senha ou encerramento de conta? [Gap, Spec §FR-020]
- [ ] CHK010 O requisito de força de senha vai além do comprimento mínimo, definindo rejeição de senhas triviais ou vazadas? [Gap, Spec §FR-001]
- [ ] CHK011 Existe requisito para recuperação de acesso quando a senha é perdida? [Gap, Edge Case]
- [ ] CHK012 Está definido o que acontece após tentativas de autenticação repetidamente falhas (limitação, bloqueio ou ausência deliberada)? [Gap]
- [ ] CHK013 Está especificado se e por qual papel o material de credencial armazenado pode ser lido de volta? [Gap, Spec §FR-001]

## Completude — Superfície HTTP e infraestrutura

- [ ] CHK014 Há requisito de transporte cifrado para as operações autenticadas, ou essa obrigação está explicitamente delegada e documentada? [Gap]
- [ ] CHK015 Existe requisito de limitação de taxa para as operações públicas de autenticação, coerente com o código `RATE_LIMITED` do catálogo de erros? [Conflict, contracts/errors.md]
- [ ] CHK016 Está definido quais clientes e origens podem chamar a API, ou a ausência dessa restrição está registrada como decisão? [Gap, Assumption]
- [ ] CHK017 Há requisito de recusar campos desconhecidos na entrada em vez de aceitá-los silenciosamente? [Gap, contracts/openapi.yaml]
- [ ] CHK018 Estão definidos limites de tamanho de corpo, de comprimento de campos textuais e de paginação? [Gap]
- [ ] CHK019 Há requisito de compatibilidade entre versões da API (política de depreciação) tratado como restrição de segurança? [Gap]

## Clareza

- [ ] CHK020 O termo "expiração por inatividade prolongada" está quantificado com um limite concreto e verificável? [Ambiguity, Spec §FR-002]
- [ ] CHK021 "Senha com no mínimo 6 caracteres" é suficiente e não ambíguo como regra única de força? [Ambiguity, Spec §FR-001]
- [ ] CHK022 "Mensagem que não revele a existência do e-mail" está definido por propriedades observáveis (mesmo status, mesmo corpo, mesmo tempo de resposta)? [Clarity, Spec §FR-003]
- [ ] CHK023 "Indicação de não autorizado" está especificado com status e código distintos para credencial ausente, expirada e revogada? [Clarity, Spec §FR-005, contracts/errors.md]
- [ ] CHK024 "Dados deixam de existir" está definido de forma precisa, incluindo abrangência do descarte e o que ocorre com cópias de backup? [Clarity, Spec §FR-020]
- [ ] CHK025 Está explícito quais valores nunca podem aparecer em registro de log, e se isso é requisito da spec ou apenas da constituição? [Gap, Constitution §V]

## Consistência

- [ ] CHK026 Os requisitos de criação de conta e de autenticação concordam sobre a divulgação da existência de um e-mail? [Conflict, Spec §FR-001 vs §FR-003]
- [ ] CHK027 Os códigos de erro previstos nos requisitos são consistentes entre a exigência geral de erro distinguível e o catálogo documentado? [Consistency, Spec §FR-019, contracts/errors.md]
- [ ] CHK028 A regra de isolamento entre usuários é expressa de forma idêntica na spec, no modelo de dados e no cenário de validação — uma regra, sem variações? [Consistency, Spec §FR-016, data-model.md §10, quickstart.md C5]
- [ ] CHK029 A regra de "recurso de outro usuário responde 404" é consistente com o 422 previsto para episódio não liberado de uma série que está no perfil? [Consistency, Spec §FR-013 vs §FR-016]
- [ ] CHK030 A exigência de sessão válida está declarada para todas as operações que tocam dado de usuário, sem exceção não documentada? [Consistency, Spec §FR-005, contracts/openapi.yaml]

## Cobertura de cenários

- [ ] CHK031 Existe requisito para o uso de credencial válida pertencente a uma conta já encerrada? [Coverage, Exception Flow, Gap]
- [ ] CHK032 Há requisito para falha parcial durante o encerramento de conta (descarte interrompido no meio)? [Coverage, Recovery, Gap]
- [ ] CHK033 Estão definidos os requisitos de resposta a comprometimento de credencial (revogação ampla, comunicação)? [Coverage, Exception Flow, Gap]
- [ ] CHK034 Há requisito de registro de eventos de segurança (autenticação falha, reuso de credencial de renovação, tentativa de acesso cruzado)? [Coverage, Gap]
- [ ] CHK035 Está definido o estado esperado do credencial armazenado no dispositivo após a saída, considerando uso em dispositivo compartilhado? [Coverage, Spec §FR-004]

## Requisitos não-funcionais e verificabilidade

- [ ] CHK036 As metas de desempenho declaram que as verificações de isolamento não podem ser sacrificadas por latência? [Measurability, Spec §SC-009]
- [ ] CHK037 A verificação de isolamento entre usuários está expressa como portão com critério de aprovação objetivamente verificável? [Measurability, Spec §SC-006]
- [ ] CHK038 O princípio não-negociável de isolamento é rastreável a todos os requisitos que dele dependem, incluindo os cenários de validação? [Traceability, Constitution §I]

## Dependências, premissas e lacunas conhecidas

- [ ] CHK039 A fronteira de confiança do catálogo externo está documentada, incluindo o que pode ser persistido sem validação? [Assumption, Spec §Assumptions, Constitution §II]
- [ ] CHK040 As obrigações de segurança atribuídas ao aplicativo cliente (guarda do credencial no dispositivo) estão explicitamente excluídas do escopo ou documentadas? [Assumption, Gap]
- [ ] CHK041 Existe modelo de ameaças documentado, ou decisão registrada de não produzi-lo neste MVP? [Traceability, Gap]
- [ ] CHK042 A premissa de que o catálogo externo é confiável está validada, dado que dados dele chegam ao usuário final? [Assumption, Spec §Assumptions]

## Notes

- Este checklist cobre **qualidade dos requisitos de segurança**, não verificação de implementação.
  Nenhum item substitui os cenários de execução em [quickstart.md](../quickstart.md).
- Itens marcados `[Gap]` apontam requisitos ausentes: os mais impactantes são limitação de taxa para
  autenticação (CHK008, CHK012, CHK015), recuperação de senha (CHK011), registro de eventos de
  segurança (CHK034) e tratamento de reuso de credencial de renovação (CHK008).
- Os itens `[Conflict]`/`[Ambiguity]` são os de maior retorno imediato: CHK026 (o cadastro revela a
  existência de um e-mail via `EMAIL_ALREADY_REGISTERED`, enquanto o login é explicitamente proibido
  de revelá-la), CHK020 (validade da sessão não quantificada), CHK021 (força de senha) e CHK015
  (`RATE_LIMITED` existe no catálogo de erros sem requisito correspondente na spec).
- Marque `[x]` apenas após revisão que confirme o critério satisfeito; deixe desmarcado o que ainda
  exige esclarecimento, correção ou decisão de produto.
- `/speckit-implement` lê o estado das caixas como portão e não deve alterar marcadores.
- `checklists/requirements.md` tem ciclo de vida próprio, mantido por `/speckit-specify` e
  `/speckit-clarify`; não é afetado por este arquivo.
