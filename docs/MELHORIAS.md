# Melhorias do painel web — plano vigente e histórico

O plano ativo está na seção 1. A seção 2 preserva a revisão de 22/09/2026 como histórico; propostas antigas já entregues ou fora do escopo não voltam ao backlog por aparecerem ali. O escopo dos pedidos futuros segue o [README](../README.md#escopo-das-melhorias): o Atualizador Automático está pausado e não entra em melhorias gerais.

<a id="plano-vigente"></a>
## 1. Plano vigente — análise de 28/09/2026

**Data da análise:** 28/09/2026
**Estado:** planejamento; nenhuma implementação autorizada por este documento
**Referência:** código do checkout nesta data; `npm run check` e `npm test` passaram (416 testes).

### 1. Escopo e premissas

Este plano cobre autenticação e sessões, clientes, atendimentos, agendamentos,
campanhas, relatórios, importação/exportação, navegação e infraestrutura do
painel. Não altera regras históricas já adotadas: versão recebida no atendimento,
versão oficial atual e tempo sem atendimento são conceitos distintos. Um
atendimento antigo nunca recebe retroativamente uma versão oficial nova.

As prioridades abaixo são de risco e benefício, não de esforço. Os pontos de
desempenho precisam ser medidos com cópia anonimizada ou sintética de volume
representativo antes de escolher índices ou reescrever consultas. Não houve
inspeção visual completa no navegador nem teste com dados de produção nesta
análise; sintomas de interface devem ser reproduzidos antes de corrigir.

### 2. Visão das entregas

| ID | Prioridade | Entrega | Resultado esperado |
|---|---|---|---|
| P01 | P0 se houver acesso fora de rede confiável; P1 na rede interna | Transporte seguro e configuração de implantação | Credenciais, sessões e dados sensíveis trafegam por HTTPS |
| P02 | P1 | Proteção CSRF das operações com sessão | Uma página de outra origem não consegue executar alterações autenticadas |
| P03 | P1 | Indicação de dados desatualizados no front | Falhas de revalidação ficam visíveis sem apagar dados úteis |
| P04 | P1 | Testes de navegador dos fluxos críticos | Fluxos completos têm regressões detectadas antes da entrega |
| P05 | P2, antecipar se houver lentidão ou falha real | Limites e medição da importação/exportação | Arquivos grandes têm comportamento previsível de memória e tempo |
| P06 | P2 | Redução do acoplamento das views grandes | Formulários, filtros e ações podem evoluir com menos risco |
| P07 | P2 | Diagnóstico de falhas das requisições | Operação distingue falha de servidor, validação e conexão |

### 3. Etapas e checklist de execução

#### P01 — Transporte seguro

**Evidência atual:** `server/src/Server.js` permite cookie de sessão sem `secure`
conforme a configuração; `server/server.js` lê `SESSION_SECURE` e `TRUST_PROXY`;
`docker-compose.yml` publica a porta 3000. `SECURITY.md` documenta o uso
possível de HTTP em rede local. O risco depende de como cada instalação é
acessada; não foi feita auditoria da infraestrutura instalada.

- [x] Inventariar os endereços usados pela equipe, inclusive acesso remoto,
      dispositivos móveis e eventual proxy já existente. *(29/09: uma
      instalação, Docker em 192.168.0.85, acessada por `http://IP:3000`, sem
      proxy; o serviço do Windows já tinha sido removido.)*
- [x] Definir URL canônica HTTPS e certificado confiável para os navegadores da
      equipe. Registrar quem renova o certificado. *(`https://gestoratualizacao`
      e `https://192.168.0.85`; autoridade própria do Caddy, raiz de 10 anos,
      certificado do site renovado pelo próprio Caddy.)*
- [x] Ajustar o proxy e `TRUST_PROXY` para a quantidade real de saltos; impedir
      acesso direto à porta HTTP a partir de redes não previstas. *(Caddy no
      `docker-compose.yml`, um salto; a porta do Node não é publicada; só a
      443, sem 80.)*
- [x] Ativar `SESSION_SECURE=true` somente depois que o proxy HTTPS estiver
      funcional; verificar login, renovação e encerramento da sessão. *(Fixo
      no compose. Login com cookie `Secure` verificado numa pilha de teste e
      em produção; HTTP direto no Node recusado com 403.)*
- [x] Atualizar instruções de instalação e recuperação em `README.md`,
      `SECURITY.md` e `docs/OPERACAO.md`.
- [ ] Cadastrar `gestoratualizacao` no DNS da empresa (ou no `hosts` de cada
      PC) e instalar a raiz do Caddy nos PCs e aparelhos da equipe — passo
      operacional, fora do código (README, "HTTPS").

**Decisão:** somente HTTPS na rede ([ADR-0010](DOCUMENTACAO_CONSOLIDADA.md#adr-0010)):
HTTP puro só escuta em `127.0.0.1`, e combinação inválida de
`SESSION_SECURE`/`TRUST_PROXY` recusa a subida.

**Aceite:** senha e cookie não cruzam o trecho acessado pelo usuário em HTTP;
login e logout funcionam pela URL oficial; o painel não aceita um caminho
alternativo de acesso que contorne a configuração. Validar em cada forma de
instalação usada de fato.

#### P02 — Proteção CSRF

**Evidência atual:** `server/src/Server.js` configura `sameSite: "lax"`, mas
`server/src/routes/index.js` não aplica proteção CSRF às rotas de escrita.
`SECURITY.md` registra essa limitação.

- [x] Escolher proteção compatível com sessão e com chamadas JSON e multipart:
      token vinculado à sessão ou validação robusta de origem, documentando a
      razão da escolha. *(Token por sessão, no cabeçalho `X-CSRF-Token`.)*
- [x] Centralizar a verificação para `POST`, `PUT`, `PATCH` e `DELETE` da API
      usada pelo navegador, incluindo importação, conta e restauração.
      *(`middlewares/protecaoCsrf.js`, no topo do `ApiRouter`, antes do multer.)*
- [x] Entregar o token pelo fluxo de autenticação e incluí-lo no `ApiClient`
      para JSON e `FormData`; tratar token ausente ou vencido com mensagem clara.
      *(Vem em toda resposta com sessão, inclusive a do login; token velho é
      renovado e o pedido repetido uma vez, e só então aparece "Recarregue a
      página".)*
- [x] Confirmar que login e configuração inicial têm o tratamento correto e
      que clientes de API sem cookie não sofrem regressão indevida. *(Os dois
      ficam fora, protegidos por só aceitarem JSON; sem sessão, continua o
      401; agentes C# não são afetados.)*
- [x] Testar sessão válida sem proteção, proteção inválida, sessão expirada e
      envio multipart; verificar que nenhuma alteração é gravada nos casos
      recusados. *(`server/tests/csrf.test.js`, `client/tests/apiclient.test.mjs`.)*

**Decisão:** token por sessão ([ADR-0011](DOCUMENTACAO_CONSOLIDADA.md#adr-0011)).

**Aceite:** todas as escritas autenticadas do navegador exigem a proteção;
as recusas devolvem erro consistente; os fluxos normais continuam operando.

#### P03 — Dados desatualizados no front

**Evidência atual:** em `client/js/app/View.js`, `swr()` conserva o valor em
cache quando uma nova consulta falha. Isso protege a tela vazia, mas não
informa por que o dado mostrado pode estar velho.

- [x] Definir estados comuns: carregando pela primeira vez, atualizado,
      revalidando, erro com dados anteriores e erro sem dados.
      *(`client/js/utils/estadoDados.js`: esqueleto, nada, barra fina, aviso
      amarelo com o horário, aviso vermelho sem horário.)*
- [x] Exibir horário da última resposta válida e ação **Tentar novamente**
      apenas quando houver falha; manter a informação anterior visível.
- [x] Diferenciar erro de rede, sessão expirada e resposta 4xx/5xx; evitar
      notificações repetidas a cada atualização de uma mesma tela.
      *(Sem conexão, painel fora do ar atrás do proxy (502/503/504), demora,
      erro do servidor e recusa com a mensagem dele; 401 continua indo para o
      login. O aviso é fixo e substitui o toast que se repetia a cada
      tentativa.)*
- [x] Aplicar primeiro às telas que orientam decisões diárias: Resumo,
      Atualizações, Clientes, Sistemas e Campanhas. *(Ficou na `View.swr`, e
      por isso vale para todas as telas que usam o cache: também Agendamentos,
      Consulta, Histórico, Distribuição e Versões.)*
- [x] Verificar que troca rápida de aba e busca cancelada não mostram erro falso.
      *(Cancelamento não avisa nem apaga uma falha real; falha num filtro some
      quando outro filtro carrega. `client/tests/estadoDados.test.mjs`.)*

**Verificado no navegador** (Chrome sem janela, servidor descartável derrubado
e religado): Resumo e Clientes mostram "Mostrando os dados de hoje às HH:MM";
Sistemas, Atualizações e Campanhas nunca abertas mostram "Não foi possível
carregar"; nenhum toast; os avisos somem quando o servidor volta. O teste
achou três telas que não passavam pelo aviso — Clientes e Sistemas buscavam a
primeira coisa fora do `swr`, e Campanhas abria um modal de erro por cima —,
corrigidas; e o aviso ficava meio coberto pelo cabeçalho quando a faixa de
"sem conexão" também estava na tela.

**Achado junto:** com o Caddy da P01 na frente, o painel fora do ar respondia
502 pelo proxy, e o `ApiClient` contava isso como "conectado" — a faixa de
"sem conexão" nunca aparecia no caso mais comum de queda. Corrigido.

**Aceite:** ao interromper a API após uma leitura válida, a tela identifica
que os dados são anteriores, mostra quando foram obtidos e permite nova
tentativa. Ao recuperar a conexão, o aviso desaparece.

#### P04 — Testes de navegador e acessibilidade dos fluxos críticos

**Evidência atual:** `npm test` cobre regras e módulos, mas a suíte do cliente
não executa os fluxos completos em navegador. A aprovação dos 416 testes não
prova foco, recorte, navegação por teclado ou responsividade reais.

- [ ] Preparar banco descartável e usuário de teste, isolados de qualquer
      instalação real. A suíte deve criar e limpar seus próprios dados.
- [ ] Cobrir login, criação/edição de atendimento, filtros, geração e cópia de
      relatório, prévia/importação de planilha, tarefas e campanha.
- [ ] Cobrir erros relevantes: sessão expirada, conflito de revisão, falha da
      API durante envio e confirmação antes de exclusão.
- [ ] Validar teclado e foco em menu, drawer, modal, tabela, ações em lote e
      mensagens de erro. Incluir checagem automatizada de acessibilidade como
      apoio, com revisão manual dos resultados importantes.
- [ ] Conferir larguras 390, 768, 1280 e 1440 px, temas claro/escuro e zoom
      do navegador. Registrar imagens apenas para regressões visuais estáveis.

**Aceite:** os fluxos essenciais completam no navegador sem erro de console,
perda de foco ou ação inacessível por teclado; não há rolagem horizontal da
página nas larguras previstas, salvo a rolagem contida de tabelas.

#### P05 — Capacidade da importação e exportação

**Evidência atual:** `server/src/routes/index.js` recebe planilha em memória
até 15 MB; `AtualizacaoRepository.exportAll()` materializa todas as linhas
filtradas; `AtualizacaoService.exportXlsxBuffer()` monta o arquivo completo em
memória. Isso é um risco de crescimento, não uma falha medida na instalação.

- [ ] Medir tempo, pico de memória e tamanho de resposta para arquivos e
      bases pequenos, médios e no maior volume esperado; registrar os números.
- [ ] Definir limite funcional de linhas por importação/exportação e resposta
      legível ao excedê-lo. Alinhar o limite ao volume real da equipe.
- [ ] Se a medição justificar, trocar importação por leitura em fluxo ou por
      arquivo temporário com limpeza garantida; manter prévia e aplicação
      transacional.
- [ ] Se a medição justificar, paginar a leitura da exportação e usar escrita
      XLSX em fluxo, preservando filtros, colunas e aba Resumo.
- [ ] Repetir testes com datas inválidas, duplicatas e falha no meio do lote;
      nenhuma importação parcial pode ficar gravada.

**Aceite:** o maior arquivo suportado conclui dentro dos limites definidos de
tempo e memória; falha ou cancelamento não deixam dados parciais nem arquivo
temporário órfão; a planilha exportada corresponde aos filtros da tela.

#### P06 — Manutenção das views

**Evidência atual:** `AtualizacoesView.js` e `AgendamentosView.js` concentram
mais de 800 linhas cada, com renderização, eventos, filtros e mutações na
mesma classe. O tamanho isolado não é defeito, mas amplia o custo de revisão.

- [ ] Identificar os blocos com motivos reais de mudança separados:
      formulário, filtros, tabela/quadro e ações em lote.
- [ ] Extrair um bloco de cada vez, mantendo contratos da `View`, `ApiClient`
      e cache. Não duplicar regras de negócio que já moram em `domain/`.
- [ ] Preservar a limpeza de listeners no `destroy()` e o cancelamento de
      requisições ao trocar filtros.
- [ ] Validar cada extração com `npm run check`, testes existentes e os fluxos
      de navegador de P04; comparar comportamento antes/depois.

**Aceite:** a view principal coordena as partes sem repetir manipulação de
DOM ou regras; testes e fluxos do usuário mantêm o mesmo resultado.

#### P07 — Diagnóstico de falhas das requisições

**Evidência atual:** `server/src/middlewares/errorHandler.js` escreve erros no
console; o front recebe mensagens HTTP pelo `ApiClient`. A análise não
confirmou correlação entre uma falha vista na tela e o log correspondente.

- [ ] Criar identificador por requisição e incluí-lo nos logs do servidor e
      na resposta de erro, sem expor detalhes internos ao usuário.
- [ ] Registrar método, rota, duração, status e classe do erro; nunca registrar
      senhas, cookies, identificadores de acesso remoto ou conteúdo integral
      de planilhas.
- [ ] Definir retenção e rotação compatíveis com a forma de instalação.
- [ ] Mostrar o identificador no aviso de erro do front para facilitar suporte.
- [ ] Verificar erros de validação, conflito, banco indisponível e falha de rede.

**Aceite:** um erro reproduzido no navegador aponta para um único registro
de diagnóstico, sem dados sensíveis no log.

### 4. Sequência e controle

1. **Preparar evidência:** levantar forma real de acesso, volume de dados e
   comportamento no navegador; manter os resultados junto ao trabalho de
   implementação.
2. **Segurança:** executar P01 conforme a implantação e depois P02. Validar
   login, sessão e todas as escritas antes de avançar.
3. **Confiabilidade visível:** executar P03 e P04; usar os testes de navegador
   como proteção para as próximas mudanças.
4. **Capacidade e manutenção:** medir P05, implementar somente o que os dados
   justificarem, extrair P06 gradualmente e concluir P07.

Em cada entrega: registrar o problema reproduzido, a decisão, o resultado dos
critérios de aceite, `npm run check`, `npm test` e a verificação de navegador
pertinente. Alterações em dados devem usar banco descartável ou cópia segura;
nenhuma validação deste plano precisa gravar no banco de produção.

---

## 2. Registro histórico — revisão de 22/09/2026

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

### 1. O que já foi entregue

Consolidado das duas auditorias, com o que a reconciliação de 22/09
confirmou contra o código.

#### Segurança e proteção de operações de alto impacto

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

#### Operação e distribuição

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

#### Interface

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
  ver ficha, marcar concluído). A conversão em atualização foi removida na E1. Confirmado
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

### 2. Ainda pendente

Itens genuinamente em aberto — não encontrados no código nem no changelog
na conferência de 22/09.

#### Confiabilidade e observabilidade

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

#### Versão-alvo manual por sistema e campanhas de atualização

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

#### Regras e notificações

- **Regras automáticas / SLA** — severidade e prazo para agente sem
  contato, versão não adotada, autorização pendente há muito tempo, script
  parcialmente aplicado, taxa de erro acima de um percentual.
- **Changelog estruturado por versão publicada** — tipo (correção/melhoria/
  segurança/banco), impacto, necessidade de parada, reversibilidade,
  compatibilidade mínima, instruções de validação.
- **Notificações configuráveis** além do Discord atual — resumo diário,
  alertas só para falhas críticas, por sistema, horários silenciosos,
  destinatários diferentes por tipo de evento, botão "Reconhecer alerta".

#### Polimento visual restante

- **Gráficos de barra** (`BarChart.js`) — cantos arredondados e animação de
  crescimento na montagem; não encontrado no código (o gráfico de linha já
  recebeu o tratamento equivalente).
- **Glassmorphism completo** — bordas com micro-brilho translúcido nos
  cards em tema escuro; o cabeçalho e a barra de ações já usam
  `backdrop-filter`, mas os cards de conteúdo não foram conferidos.
- **Tooltips ricos em todos os gráficos** (pizza e barra, não só linha).

---

### 3. Roadmap sugerido

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
