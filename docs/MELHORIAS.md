# Melhorias — estado e backlog

**Projeto:** Gestor de Atualizações — Painel web
**Reconciliado em:** 22 de setembro de 2026

Este documento reúne e substitui dois arquivos que existiam separadamente em
`web/docs/`: `ANALISE_MELHORIAS_WEB.md` (auditoria técnica, 18/09/2026) e
`PLANEJAMENTO_MELHORIAS_UX_UI.md` (planejamento de UX/UI, também 18/09/2026).

**Por que juntar os dois:** os dois documentos descreviam o mesmo tipo de
coisa — o que falta fazer — só que um pela lente técnica/segurança e o outro
pela lente de interface. Quatro dias depois de escritos, quase todo o
conteúdo do segundo (gavetas, presets de data, ações rápidas por linha,
Kanban em Agendamentos, Ficha 360° do cliente, atalhos `j`/`k`/`e`/`x`/`c`,
piloto + rollback) já tinha sido entregue — o próprio
[`CHANGELOG.md`](../CHANGELOG.md) registra isso numa entrada só ("Roadmap
UX/UI entregue em quatro frentes"). Um documento de planejamento que descreve
como pendente o que o changelog já descreve como pronto é pior que não ter
documento: ele engana quem lê. Reconciliado nesta revisão conferindo contra o
código (`grep` por `Drawer`, `Kanban`, `revisao`, `piloto`, `rollback`, diffs
em `HistoricoView`, entre outros) e contra o `CHANGELOG.md`.

**Como este documento se relaciona com os outros:** aqui fica **o que falta**
(backlog). O que já existe e como funciona está em
[`DOCUMENTACAO_CONSOLIDADA.md`](DOCUMENTACAO_CONSOLIDADA.md) — que, na data
desta reconciliação, ainda não tem uma seção dedicada às entregas de
Kanban/Ficha 360°/diffs/piloto+rollback descritas abaixo; vale atualizá-la
na próxima revisão. O que mudou e quando é o [`CHANGELOG.md`](../CHANGELOG.md).

---

## 1. O que já foi entregue

Consolidado das duas auditorias, com o que a reconciliação de 22/09
confirmou contra o código.

### Segurança e proteção de operações de alto impacto

- **Permissões granulares (RBAC)** — três papéis (`consulta`/`operador`/`admin`),
  middleware `requireRole`, gestão de papéis pela interface, travas contra
  rebaixar/excluir o último administrador.
- **Publicação de versão transacional** — `publicarESubstituir` numa
  transação `better-sqlite3` só; restrita a `admin`; valida no disco que o
  pacote existe antes de publicar.
- **Uploads endurecidos** — limites de tamanho e extensão no Multer,
  SHA-256 calculado por stream (não trava o Event Loop), limpeza automática
  de arquivo temporário em caso de erro.
- **Restauração de backup protegida** — só `admin`, confirmação digitando
  `RESTAURAR`, revalidação de senha, download preventivo do banco atual,
  invalidação de todas as sessões ao concluir.
- **Concorrência otimista (OCC)** — campo de revisão + HTTP 409 quando o
  registro já foi alterado por outra pessoa. Confirmado no código
  (`AgendamentoService`, `AtualizacaoService`, `ClienteService` e seus
  repositórios). A auditoria técnica de 18/09 ainda listava isto como
  pendente ("2.2 Controle de concorrência"); foi implementado depois.

### Operação e distribuição

- **Centro de saúde operacional** — `SaudeService` + `GET /api/saude`,
  painel `SaudeSistemaPanel.js` com integridade do SQLite, backups, pacotes
  em disco, estatísticas de agentes e métricas do processo Node.
- **Matriz de versões por cliente** — na Consulta, `Sistema | Instalada |
  Publicada | Estado | Último contato`.
- **Busca global (`Ctrl+K`)** — clientes, versões publicadas, agentes com
  incidente, comandos de ação direta, com deep-linking para a tela já
  filtrada.
- **Canal piloto + rollback** — publicar uma versão como piloto (por código
  de cliente), promover para geral, ou reverter para a versão anterior;
  transação atômica, restrito a administrador. Confirmado no código
  (`VersaoService`, `VersaoRepository`).
- **Geração de agendamentos em lote** — na tela Sistemas, botão "Gerar
  Agendamentos em Lote" para os clientes defasados de uma data de corte.
  Confirmado (`SistemasView`).

### Interface

- **Navegação agrupada** na sidebar (Visão Geral / Operação / Distribuição /
  Administração), com tooltips e colapso.
- **Resumo orientado a decisões** — faixa "Precisa de atenção" com cards de
  severidade e navegação de um clique até a tela filtrada.
- **Distribuição como painel de incidentes** — agentes ordenados por
  severidade, diagnóstico copiável, ações de pausar/retomar/excluir.
- **Linha do tempo de versões** e **paleta semântica de cores** (4 camadas,
  WCAG AA, nos dois temas).
- **Gavetas laterais (drawers)** para os formulários de Atualizações e
  Agendamentos, no lugar de formulário fixo empurrando a tabela. Confirmado
  (`components/Drawer.js`, usado em `AgendamentosView`, `ClientesView`,
  `AtualizacoesView`).
- **Ações rápidas por linha ao passar o mouse** (copiar relatório, editar,
  ver ficha, marcar concluído, converter em atualização). Confirmado
  (`row-actions` em `AgendamentosView`, `ClientesView`, `AtualizacoesView`,
  `DistribuicaoView`).
- **Presets de período com um clique** (Hoje, Esta semana, Este mês, ...).
  Confirmado (`components/DatePresets.js`).
- **Quadro Kanban em Agendamentos**, com alternância para lista tabular.
  Confirmado (`AgendamentosView`).
- **Ficha 360° do cliente** — cadastro, acessos remotos, matriz de versões e
  linha do tempo num painel só (`ConsultaView`), substituindo a separação
  antiga entre Clientes e Consultar Cliente.
- **Histórico com diff visual antes × depois** — snapshot da alteração,
  campo a campo. Confirmado (`HistoricoView`).
- **Skeletons de carregamento** (efeito shimmer) nas tabelas. Confirmado
  (`components/SortableTable.js`).
- **Atalhos de teclado estilo power-user** — `j`/`k` para navegar linhas,
  `e` editar, `x` selecionar, `c` copiar relatório, `/` foca a busca,
  além dos já existentes `Alt+1..9`, `Ctrl+K`, `?`.
- **Gráfico de linha modernizado** — curva suavizada (Catmull-Rom → Bézier),
  área com gradiente, halo no ponto mais recente, crosshair + tooltip.

---

## 2. Ainda pendente

Itens genuinamente em aberto — não encontrados no código nem no changelog
na conferência de 22/09.

### Confiabilidade e observabilidade

- **Ampliar testes automatizados** para os fluxos que a auditoria de 18/09
  listava e que não têm confirmação explícita de cobertura: importação e
  exportação de planilha, publicação/substituição/exclusão de versões,
  falhas parciais de scripts, migrações e normalização, limpeza de arquivos
  órfãos. (Há 458 testes na suíte atual — não verificado quais desses
  cenários eles cobrem um a um.)
- **Logs estruturados** — JSON com rotação, id por requisição, duração e
  status por chamada, usuário responsável, consulta administrativa das
  falhas recentes. Nada disso foi encontrado no `package.json` do servidor
  (sem `winston`/`pino`/logger próprio).
- **Dependência `uuid` (via `exceljs`)** — vulnerabilidade moderada
  transitiva ainda sem correção upstream. Decisão pendente: aguardar
  `exceljs` novo, trocar de biblioteca, ou aceitar o risco formalmente.

### Versão-alvo manual por sistema e campanhas de atualização

_Proposta de 23/09/2026, ainda não aprovada para implementação._

**Problema:** com o Atualizador desativado (ver
[DOCUMENTACAO_CONSOLIDADA.md, seção 3.4](DOCUMENTACAO_CONSOLIDADA.md#34-estado-atual-pré-piloto)),
a atualização dos clientes voltou a ser manual, e o painel não ajuda nisso:
- A aba "Matriz de Versões" da ficha do cliente busca a versão publicada em
  `/api/versoes/painel`. Com o Atualizador desligado, essa rota responde 403,
  e a matriz mostra "Sem publicação" em todos os sistemas de todos os
  clientes (`ConsultaView`, chamada com `.catch(() => null)`).
- "Desatualizado" hoje é medido por tempo (`DESATUALIZADO_DIAS = 60`), não
  por versão. O painel não sabe dizer quem está abaixo da versão atual de
  um sistema.

**Proposta:**
- **Versão-alvo:** um administrador define, por sistema, qual é a versão
  atual (ex.: B_Vendas 2026.09.01), sem depender do Atualizador.
- **Matriz:** passa a comparar a última versão registrada de cada cliente com
  essa versão-alvo.
- **Resumo:** ganha o indicador "N clientes com <sistema> abaixo da <versão>".
- **Campanha:** definir uma versão-alvo nova abre uma campanha com a lista de
  clientes pendentes e o progresso. Ela pode gerar agendamentos em lote, que
  já existe hoje por data de corte na tela Sistemas.
- **Quando o Atualizador voltar,** a versão-alvo passa a ser a versão
  publicada, e nada do que foi montado se perde.

**Risco:** a versão é texto livre no cadastro de atualização. A comparação
exige um formato consistente, então vem junto a validação do campo
`versao` no formulário e na importação de planilha.

### Regras e notificações

- **Regras automáticas / SLA** — severidade e prazo para agente sem
  contato, versão não adotada, autorização pendente há muito tempo, script
  parcialmente aplicado, taxa de erro acima de um percentual.
- **Changelog estruturado por versão publicada** — tipo (correção/melhoria/
  segurança/banco), impacto, necessidade de parada, reversibilidade,
  compatibilidade mínima, instruções de validação.
- **Notificações configuráveis** além do Discord atual — resumo diário,
  alertas só para falhas críticas, por sistema, horários silenciosos,
  destinatários diferentes por tipo de evento, botão "Reconhecer alerta".

### Polimento visual restante

- **Gráficos de barra** (`BarChart.js`) — cantos arredondados e animação de
  crescimento na montagem; não encontrado no código (o gráfico de linha já
  recebeu o tratamento equivalente).
- **Glassmorphism completo** — bordas com micro-brilho translúcido nos
  cards em tema escuro; o cabeçalho e a barra de ações já usam
  `backdrop-filter`, mas os cards de conteúdo não foram conferidos.
- **Tooltips ricos em todos os gráficos** (pizza e barra, não só linha).

---

## 3. Roadmap sugerido

| Ordem | Entrega |
|---:|---|
| 1 | Testes de integração dos fluxos ainda sem cobertura confirmada |
| 2 | Logs estruturados e consulta administrativa de falhas |
| 3 | Changelog estruturado por versão publicada |
| 4 | Regras automáticas / SLA para incidentes |
| 5 | Notificações configuráveis (resumo diário, silêncio, destinatário por evento) |
| 6 | Polimento visual restante (barras, glass completo, tooltips) |
| 7 | Decisão formal sobre a dependência `uuid`/`exceljs` |
| — | Versão-alvo manual e campanhas (proposta de 23/09, a priorizar) |

---

_Documento reconciliado em 22/09/2026 a partir de `ANALISE_MELHORIAS_WEB.md`
e `PLANEJAMENTO_MELHORIAS_UX_UI.md` (ambos removidos), conferido contra o
código-fonte e o `CHANGELOG.md`. O histórico original de cada um continua
disponível no `git log`._
