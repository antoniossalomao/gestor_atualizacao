# Histórico de mudanças — painel web

Registro do que foi acrescentado em cada etapa, **com o motivo de cada
decisão** — inclusive as que deram errado antes de dar certo. Este arquivo
nasceu dentro do [README](README.md) e foi separado quando passou de 270
linhas: quem chega no projeto precisa do README curto o bastante para ler
inteiro, e quem investiga "por que isso é assim?" precisa deste histórico
inteiro. São públicos diferentes.

Não é um changelog de versões publicadas (o projeto não versiona releases
do painel): é um diário de decisões, em ordem cronológica.

Para o agente C#, o equivalente é
[`atualizador/RISCOS-CONHECIDOS.md`](../atualizador/RISCOS-CONHECIDOS.md).

### Setembro de 2026

- **Agendamentos: prioridade, sistema e observação.** Cada tarefa ganhou
  prioridade (Baixa, Normal, Alta, Urgente), o sistema a atualizar e um campo
  de observação. Feito com o Gemini.
  - No quadro, Urgente e Alta ganham selo e borda colorida, a observação
    aparece em até duas linhas no cartão, e o cabeçalho de cada coluna conta
    as vencidas (ou, sem vencidas, as urgentes e altas).
  - Dentro de cada coluna as mais urgentes vêm primeiro, e há filtro por
    prioridade.
  - Tarefas que já existiam ficam como "Normal" e sem sistema. A geração em
    lote grava o sistema do lote em cada tarefa.
  - O cartão "Tempo Médio de Resolução de Tarefas" saiu do Resumo.

- **Administração virou uma tela própria, só de administrador.** Tudo o que é
  da equipe inteira saiu do painel de preferências pessoais, onde era uma
  seção "Segurança" feita só de links para cinco modais, cada um com desenho
  próprio. Agora é uma tela com abas: Usuários, Histórico, Regras da equipe,
  Notificações, Atualizador, Backups e Saúde do servidor.
  - **O Histórico mudou de lugar** e passou a ser só de administrador. Operador
    e Consulta deixam de vê-lo.
  - **As regras da equipe foram para o banco** e valem na hora, sem reiniciar
    (`server/src/config/regrasEquipe.js`). Duas delas nem eram ajustáveis: os
    60 dias de "desatualizado" e as 10 cópias de backup estavam fixos no código.
    O dia de arquivar tarefa tinha três padrões diferentes (30 no código, 7 no
    exemplo, o valor de cada `.env`). Na primeira subida, o que estava no
    `.env` é trazido para o banco uma vez só.
  - **A tela não escreve mais no `.env`.** A antiga "Configuração da API"
    reescrevia o arquivo, pedia para reiniciar e mandava a chave dos agentes
    inteira para o navegador. A chave continua no `.env`; a tela só mostra se
    ela existe e como termina. No Docker, o `.env` passa a ser montado só
    para leitura.
  - **Discord:** botão de mensagem de teste, e o webhook só aceita endereço do
    Discord (o servidor faz POST nele). Configurar o webhook com o servidor no
    ar agora liga o alerta de agentes sem reiniciar.
  - **Configurações pessoais:** "Sistema" virou "Conta", com a troca da
    própria senha (antes escondida em "Usuários e Permissões"). Com o
    Atualizador desligado, somem os ajustes que só serviam a ele.
  - **Acabamento corrigido:** ícone de 200px e títulos quebrados na Saúde,
    campos sem espaço na Configuração da API, botão-link sublinhado nos backups.

- **Rebaixar ou excluir um usuário agora derruba as sessões dele.** O papel
  que as rotas conferem é o copiado para a sessão no login. Sem isso, um
  admin rebaixado continuava admin por até 7 dias, e podia inclusive religar
  o Atualizador. Trocar só o nome não desloga ninguém.
- **O servidor se recusa a subir sem `SESSION_SECRET`, ou com o valor de
  exemplo do `.env.example`.** Esse valor é público, e com ele qualquer um
  forja um cookie de admin. O caso mais comum era silencioso: no Docker, sem
  o `server/.env`, o servidor subia com o segredo de exemplo. Agora o
  container não sobe, e o motivo aparece em `docker compose logs`.
- **Tag `html` para montar HTML (`utils/html.js`).** Ela escapa todo valor
  interpolado. O que antes dependia de lembrar do `escapeHtml` em cada
  interpolação passa a ser o padrão. O próprio `escapeHtml` não escapava
  aspas, e o `aria-label` do cartão do kanban quebrava com uma tarefa que
  tivesse `"` no título.
  - Já foram migrados: Agendamentos, Atualizações, Clientes, Consultar
    Cliente, Resumo, o sino e a paleta Ctrl+K.
  - O resto está listado em `client/tests/html-seguro.test.mjs`, uma trava
    em que a contagem de cada arquivo só pode cair.
  - A marcação e a regra dessas telas saíram das views para `templates/` e
    `domain/`, onde são testadas no Node (`client/tests/telas.test.mjs`).

- **Colunas da tabela de Atualizações cortando texto, e "Obs" ocupando um
  quarto da tela.** Duas causas, achadas comparando a tela renderizada
  contra uma cópia isolada da mesma tabela (mesmo CSS, mesmo componente,
  fora do app) num Chrome headless: `LARGURAS_ATUALIZACAO` reservava só
  58px para "Máquinas" -- não cabe nem o rótulo do cabeçalho, que vazava
  visualmente pra dentro da coluna "Obs" ao lado -- e só 86px para "Ações",
  8px a menos do que os próprios 3 botões (26px cada) mais o padding da
  célula já ocupam sozinhos, empurrando o terceiro ícone para debaixo da
  barra de rolagem. "Obs", em compensação, tinha 22% da tabela (a fatia
  individual mais larga depois de "Cliente") para mostrar, normalmente,
  uma frase curta. Larguras redistribuídas (`AtualizacoesView.js`) sem
  abrir mão de "nenhum rolamento horizontal" -- testado até 1300px de
  largura de tabela, congestionado de propósito, sem nenhuma coluna
  sobrepondo a vizinha.

  A causa-raiz por trás do cabeçalho "vazando" era mais geral, e por isso a
  correção foi no componente, não só nesta tela: o cabeçalho ordenável
  (`SortableTable`) é um `<button>` `display:flex`, e um item flex não
  encolhe abaixo do tamanho do próprio conteúdo por padrão -- sem
  `min-width: 0` no botão e sem o rótulo estar num `<span>` próprio com
  `text-overflow: ellipsis`, um texto comprido numa coluna estreita
  simplesmente ultrapassava a largura da célula em vez de truncar. Vale
  para qualquer tabela que use `SortableTable`, não só Atualizações.

- **O selo vermelho do indicador "Parados" no Resumo mostrava um pedaço de
  cor destacado atrás do ícone.** `.stat-tile__icon` é uma caixa quadrada de
  16x16 sem `border-radius`; o ícone `alerta` é um triângulo, que não
  preenche os quatro cantos do quadrado. Enquanto o fundo ficava
  `transparent` (estado normal) isso não aparecia -- só quando o indicador
  vira alerta (`.is-alert`, fundo `--cor-vermelho-fraco`) as quinas do
  quadrado expostas ao redor do triângulo pareciam uma mancha de cor errada.
  Corrigido com o mesmo raio que `.stat-tile__delta`, no mesmo arquivo, já
  usa para o mesmo tipo de selo colorido.

- **O painel passou a ter imagem Docker** (`Dockerfile`, `.dockerignore`,
  `docker-compose.yml`). Não substitui o serviço do Windows via NSSM: é a
  opção para quando o app vai para uma máquina Linux, ou para isolá-lo do
  resto do que roda no PC. Quatro coisas tiveram que ser resolvidas, e todas
  as quatro falhariam **em silêncio** se tivessem sido ignoradas:

  - **Fuso.** O container roda em UTC por padrão, e `AgendamentoRepository.dueSoon`
    monta "hoje" com `getFullYear/getMonth/getDate` — relógio **local**. Das
    21h à meia-noite, horário de Brasília, o servidor já estaria no dia
    seguinte e os agendamentos de amanhã apareceriam como atrasados no sino
    de notificações. Daí o `TZ=America/Sao_Paulo` fixado na imagem.
  - **O `.env` tem que ser gravável.** A tela *Configurações → Sistema →
    "Configuração da API"* escreve no arquivo (`ConfiguracaoApiService`), o
    que descarta passar tudo por `environment:` no compose. Pior: o `dotenv`
    não sobrescreve variável que já veio do ambiente, então qualquer variável
    declarada no compose venceria o `.env` e faria aquela tela salvar sem
    efeito nenhum, sem erro. Só `PORT` ficou no compose — não é editável por
    lá, e fixá-la é o que mantém o mapeamento de portas sempre válido.
  - **Dados em volume nomeado, não em pasta do Windows.** O SQLite em modo
    WAL depende de travas de arquivo que não funcionam de forma confiável
    através da tradução de sistema de arquivos do Docker Desktop. O caminho
    para tirar cópia para fora continua sendo o download de backup do próprio
    painel.
  - **Base Debian, e contexto de build em `web/`.** `better-sqlite3` é módulo
    nativo: em glibc baixa binário pronto, em Alpine (musl) compilaria do
    zero a cada build. E `server/package.json` depende de `file:..`, o pacote
    da raiz — construir a partir de `web/server/` quebra o `npm ci` antes de
    começar. É também por isso que os caminhos são `/app` e `/app/server` nos
    dois estágios: o vínculo `file:..` é um link simbólico relativo, e só
    continua apontando para o lugar certo se a estrutura de pastas for
    idêntica na imagem final.

  A verificação de saúde bate em `/api/auth/status` — rota pública que
  responde do banco —, e não numa rota que só provaria que o processo está
  de pé. É feita com `node -e` em vez de `curl` porque a imagem slim não tem
  curl, e instalar um só para isso seria uma camada a mais à toa.

  Testado de ponta a ponta (build, subida, healthcheck, importação do
  `gestao.db` real) num Docker Desktop de verdade, e a receita de "trazer um
  banco que já existe" do README mudou por causa disso: `docker compose cp`
  recusa copiar para um container parado ("no container found for
  service"), e qualquer cópia para dentro do container chega dona de
  `root` -- sem corrigir isso o servidor sobe e cai na hora com
  `SqliteError: attempt to write a readonly database` (o processo roda como
  `node`, uid 1000). A receita final usa `docker cp` simples (funciona
  parado) seguido de `docker run --volumes-from` para o `chown` -- essa
  última parte evita depender do nome do volume nomeado, que o Docker deriva
  do nome da pasta do projeto e muda se ela for renomeada.

  O Docker Scout apontou 70 vulnerabilidades na imagem (3 críticas), e as
  duas mais graves com correção disponível -- CVE em `tar` e em
  `brace-expansion`, severidade 9.2 e 8.7 -- não vinham de dependência
  nenhuma do projeto: são internas ao próprio CLI do npm, que a imagem base
  carrega em `/usr/local/lib/node_modules/npm/`. Como o CMD final roda
  `node server.js` direto e nada em tempo de execução chama `npm`/`npx`
  (só o build, no `RUN npm ci` do primeiro estágio, usa), o runtime final
  apaga os dois (`npm`, `corepack`) com um `rm -rf`. Resultado: as críticas
  fixáveis foram para zero, e o total caiu de 70 para ~47 -- o que sobra é
  todo pacote de sistema (perl, util-linux, zlib) ainda sem correção
  publicada pela Debian, fora do nosso controle.

- **As notificações viraram um sino no cabeçalho.** Havia duas coisas grandes
  dizendo pedaços do mesmo assunto ("o que está pendente agora"): a faixa
  amarela de lembretes, que ficava entre o cabeçalho e o conteúdo de **toda**
  aba, e o bloco "Precisa de Atenção", que abria o Resumo com uma grade de
  cards de 220px. Somadas, custavam a primeira dobra da tela inicial para
  informação que cabe num número de dois dígitos. As duas saíram e viraram um
  sino ao lado do nome de usuário (`components/MenuNotificacoes.js`), com
  contador e um painel que lista agendamentos atrasados, agendamentos de hoje
  e agentes com falha, com pendências, esperando autorização há tempo demais
  ou sem contato. Cada linha leva à tela do assunto **já filtrada** — o bloco
  antigo tinha o `data-filter` no HTML mas o descartava no clique, entregando
  a lista inteira de Distribuição para quem tinha clicado em "1 agente com
  falha". O que se perde é o "não dá para não ver"; o que compensa é o `(2)`
  no título da aba do navegador, que passou a contar tudo isso e é o único
  canal que alcança quem está com o Gestor atrás do ERP. "Marcar como vistas"
  apaga o contador e não a lista, pela mesma regra de antes (vale até o dia
  seguinte ou até uma sessão nova).

- **O card "Agendamento atrasado" do Resumo nunca apareceu.** `ResumoView` lia
  `lembretes.atrasados`, mas `/agendamentos/lembretes` devolve um **array**
  puro (ver `AgendamentoRepository.dueSoon`). `undefined || []` virava lista
  vazia, o card não era montado, e nada disso produzia erro no console: um
  aviso que não avisava, desde que foi escrito. A contagem saiu da tela e foi
  para `domain/notificacoes.js`, que não toca no DOM e por isso tem teste —
  que é o que impede a próxima versão do mesmo silêncio.

- **Botões de ação por linha (Atualizações, Clientes, Agendamentos) trocaram
  emoji colorido por ícone SVG monocromático.** Os botões usavam glifos de
  emoji (📋 👤 ✏️ 🔑 🔍) como conteúdo do `<button>`; cada sistema operacional
  renderiza emoji com sua própria fonte colorida, destoando do resto da
  interface, que usa só os ícones de linha de `utils/icons.js`
  (`stroke="currentColor"`). Trocado por `icon()`, acrescentando os ícones
  `editar`, `chave` e `converter` ao conjunto existente.

- **Atualização automática da Distribuição concentrada em Configurações.** A
  tela deixou de repetir estado, liga/desliga e contagem regressiva; também
  removeu a barra de progresso contínua. A atualização manual permanece como
  um botão compacto, somente com ícone e rótulo acessível.

- **Roadmap UX/UI entregue em quatro frentes.** Atualizações e Agendamentos
  passaram a usar gavetas laterais, ações rápidas por linha, presets de data,
  atalhos `j/k/e/x/c` e busca por `/`; Agendamentos ganhou visão Kanban e
  Sistemas gera tarefas em lote. A consulta virou Ficha 360° com cadastro,
  acessos, matriz de versões e linha do tempo. Distribuição ganhou live pulse
  opcional, e o catálogo passou a aceitar piloto por código de cliente, promoção
  e rollback transacional. A escolha do grupo ganhou busca por código/nome e
  seleção visual por chips. A auditoria guarda snapshots para exibir Antes × Depois, e
  Agendamentos usa revisão otimista para impedir sobrescrita silenciosa.

- **`*/` dentro de um comentário derrubou o CSS inteiro.** Numa correção de
  comentário em `components.css`, o texto `client/js/**` seguido de `/*.js`
  formou um `*/` — que **fecha o comentário de cabeçalho ali**. Da quinta linha
  em diante, a prosa em português virava CSS inválido e o navegador descartava
  o começo da folha: a página carregava inteira, sem estilo nenhum.
  O defeito passou por status HTTP 200, `Content-Type: text/css`, tamanho certo
  e console limpo — CSS falha em silêncio por desenho. Corrigido, e coberto por
  `client/tests/css.test.mjs`, que confere comentário aberto, chaves
  balanceadas, primeira regra válida e prosa acentuada fora de comentário.

- **Dois backups no mesmo segundo viravam um só.** O nome do arquivo de
  backup usa carimbo com resolução de segundos (`gestao_AAAAMMDD_HHMMSS.db`) e
  a cópia é um `fs.copyFileSync`, que sobrescreve sem avisar. O caminho
  perigoso é a restauração: ela faz uma cópia de segurança do estado atual
  imediatamente antes de sobrescrever o banco, e essa cópia podia cair no mesmo
  segundo de um backup já existente — **apagando-o em silêncio**. Perder um
  backup assim só se descobre no dia em que ele faz falta. Corrigido
  acrescentando um sufixo (`_2`, `_3`) apenas quando há colisão, de modo que o
  nome de sempre continua o mesmo no caso normal; o rótulo na tela mostra
  "18/09/2026 13:16:25 (2)".

- **O painel de Saúde reportava "0 pacotes, 0 bytes" — sempre.**
  `SaudeService` lia `this.versoes.packagesDir`, propriedade que `VersaoService`
  **nunca teve**. Como `fs.existsSync(undefined)` devolve `false` em vez de
  lançar, a métrica ficava zerada em silêncio, sem nada no log. O teste que
  existia não pegava: o dublê de `versoes` declarava `packagesDir`, ou seja, o
  teste afirmava uma interface que o objeto real não implementava — e ninguém
  desconfiaria olhando a tela, porque zero é um número plausível demais.
  Corrigido com um getter `packagesDir` de verdade (que `_caminhoPacote` passou
  a reaproveitar), mais um teste que faz a asserção contra a **classe real**, e
  não contra o dublê. Encontrado por verificação estática de tipos.

- **Verificação estática de tipos, sem etapa de build.** `npm run check` roda o
  TypeScript em modo `checkJs`/`noEmit` sobre o código puro dos dois lados
  (`client/js/domain`, `client/js/utils`, `server/src/shared`,
  `services/normalizacao.js`), conferindo o JSDoc que já existia. Nada é
  compilado e o navegador continua executando exatamente o que está em
  `client/`. Também no CI. Ver
  [ADR-0006](docs/adr/0006-verificacao-de-tipos-sem-build.md) — inclusive por
  que o resto do front-end fica de fora.

- **`?sortBy=constructor` derrubava qualquer listagem paginada.**
  `shared/sortHelper.js` lia a coluna pedida com `sortMap[sortBy]`, e o acesso
  por índice a um objeto literal também alcança o que ele **herda** de `Object`
  — `constructor`, `toString`, `valueOf`, `hasOwnProperty`, `__proto__`. Todos
  devolvem valor "truthy", passavam pela checagem `if (!expr)` e eram
  interpolados no SQL, gerando
  `ORDER BY function Object() { [native code] } ASC`. Não era injeção (nada que
  o atacante escreve chega ao SQL), mas era SQL inválido: qualquer pessoa
  logada derrubava com 500 toda listagem paginada mudando um parâmetro na barra
  de endereço. Corrigido com `Object.hasOwn` mais checagem de tipo. Encontrado
  ao escrever o primeiro teste dessa função — ela nunca tinha sido testada.

- **Um caminho de asset inexistente respondia 200 com o `index.html`.** O
  fallback de SPA capturava qualquer caminho fora de `/api`, então um arquivo
  movido de pasta devolvia HTML no lugar do módulo, e o navegador só reclamava
  depois com "expected a JavaScript module script but the server responded with
  a MIME type of text/html" — mensagem que manda procurar no lugar errado.
  Agora um pedido com extensão de arquivo que não existe dá 404 de verdade
  (`middlewares/notFoundHandler.js`), e rota de API inexistente responde JSON,
  não HTML. Encontrado durante a reorganização de pastas do `client/`.

- **`client/package.json` e `client/tests/` eram servidos publicamente** pelo
  `express.static`. Não havia segredo neles, mas entregavam de graça um mapa
  dos módulos internos. Bloqueados antes do estático.

- **Reorganização do `client/js/`**: a pasta `core/`, com 35 arquivos
  misturando cinco categorias, virou `app/`, `components/` (+ `charts/`),
  `domain/` e `utils/`, cada uma com um critério verificável. 175 caminhos de
  importação reescritos. Ver
  [ADR-0005](docs/adr/0005-organizacao-do-client-por-responsabilidade.md).

- **Testes**: de 28 para 458 no painel (359 no servidor, 99 no front-end). Passaram a ter cobertura o
  roteamento HTTP (ordem de API × estático × fallback), o grafo de módulos do
  front-end, os helpers de `shared/` e a normalização de sistemas/responsáveis.

- **Documentação**: este histórico saiu do README (que tinha 641 linhas);
  criados `CONTRIBUTING.md`, `SECURITY.md`, `docs/adr/` com 5 decisões
  registradas, e um README na raiz do espaço de trabalho cobrindo painel +
  agente. CI próprio (`.github/workflows/ci.yml`), que antes não existia.

- **Alerta proativo de agente offline/com erro** (`AlertaAgenteService`):
  com `DISCORD_WEBHOOK_URL` configurada, o app confere sozinho a cada
  `ALERTA_AGENTES_INTERVALO_MINUTOS` (padrão 15) a situação de cada agente
  do Atualizador automático (mesmo cálculo do painel da aba Distribuição)
  e avisa o canal só na *transição* para "offline" (sem contato há 24h+)
  ou "erro" — não repete o aviso a cada ciclo enquanto o problema
  continua, e avisa de novo quando o agente volta a se comunicar. Antes,
  só quem abrisse a tela do painel saberia que um cliente parou de
  atualizar.
- **Tendência mensal de atualizações** (Resumo): gráfico com os últimos 12
  meses, para ver se o volume de atualizações está subindo ou caindo ao
  longo do tempo — antes só existia o total do mês atual.
- **Grupo/rede de clientes**: novo campo opcional "Grupo/Rede" no
  cadastro de Clientes (com autocompletar dos grupos já usados), pra
  clientes com várias unidades sob a mesma bandeira (ex.: sete lojas de
  uma mesma rede) poderem ser encontrados/agrupados por busca. Não muda
  nada em quem não usa o campo.
- **Converter Agendamento em Atualização**: botão "Converter em
  Atualização" na tarefa selecionada da aba Agendamentos — leva pra
  Atualizações com cliente, responsável, data e um registro novo (não
  edita nada) já pré-preenchidos a partir da tarefa, em vez de digitar
  tudo de novo.
- **Tempo médio de resolução por responsável** (Resumo): quantos dias, em
  média, uma tarefa de Agendamentos leva entre ser criada e ser marcada
  "Concluído", por responsável. Só entra no cálculo tarefa criada
  *depois* desta métrica existir — tarefas antigas não têm como saber
  quando foram criadas de verdade, e contar uma data inventada seria pior
  que não mostrar nada.

### 10/09/2026

- **Acessos remotos por cliente** (aba Clientes, botão **Acessos** no
  topo, ao lado de "Novo Cliente"): cadastro de AnyDesk/Suporte Bredas de
  cada máquina de um cliente (servidor, estações, etc.), com botão de
  copiar ao lado de cada ID. Tabela nova (`cliente_acessos`), apagada
  automaticamente junto com o cliente se ele for excluído.
- **Ações em lote em Agendamentos e Clientes** (mesmo padrão que já
  existia em Atualizações — segurar `Shift` e clicar em duas linhas
  seleciona tudo entre elas): em Agendamentos dá para concluir ou excluir
  várias tarefas de uma vez (com "Desfazer"); em Clientes dá para marcar
  um sistema em vários de uma vez ou excluir vários (sem "Desfazer" aqui
  — ver comentário em `ClienteService.deleteMany`, a exclusão em lote de
  cliente também apaga os acessos remotos cadastrados neles).
- **Changelog em itens na Distribuição**: o campo "Observações" ao
  preparar uma versão virou uma lista de itens (adicionar/remover linha),
  em vez de um texto livre só — a aba Versões mostra como lista com
  marcadores.
- **Histórico recente na Consulta**: a ficha de um cliente mostra as
  últimas 5 atualizações dele, não só a mais recente.
- **Verificação de integridade dos backups**: cada backup automático
  roda um `PRAGMA integrity_check` do SQLite assim que é criado; se
  falhar, aparece um aviso "Corrompido" na tela de Backups e um erro no
  log do serviço — antes, um backup corrompido só seria descoberto na
  hora de precisar restaurar de verdade.
- **Trocar a própria senha e "último login"**: qualquer pessoa logada
  pode trocar a própria senha pela tela de Usuários (pede a senha atual);
  a mesma tela mostra quando cada conta acessou pela última vez. Para
  quando ninguém mais consegue entrar, ver "Recuperando acesso" abaixo.
- **Correção de um bug de CSS que afetava várias telas**: qualquer
  elemento escondido com o atributo `hidden` cuja classe definisse
  `display` (a maioria dos botões, barras de ferramentas, formulários
  recolhíveis) na verdade continuava aparecendo — "Limpar busca"
  aparecia mesmo sem busca nenhuma, a barra de progresso de upload
  aparecia parada em "0%" sem upload nenhum, os formulários "Convidar
  Pessoa"/"Trocar minha senha" apareciam sempre abertos. Corrigido com
  uma regra CSS única e global, em vez de remendo por componente.

### 11/09/2026

- **Relatório de atualização** (aba Atualizações, botão **Gerar
  Relatório** ao lado de "Atualizar Selecionado"): monta o texto do que
  foi feito, pronto para copiar num chamado. Dois formatos no mesmo
  modal — **Esta atualização** (o registro selecionado, com a versão
  anterior do cliente entre parênteses) e **Histórico do cliente**
  (todas as atualizações daquele cliente, da mais recente para a mais
  antiga). O botão "Copiar" leva o texto para a área de transferência e
  fecha; se o navegador não deixar copiar (HTTP puro, ver
  `copyToClipboard` em `client/js/utils/html.js`), o modal fica aberto
  com o texto selecionado em vez de sumir com ele.

  Não exigiu campo novo nenhum: o relatório usa só o que já está gravado
  em `atualizacoes` e `clientes`, então os registros antigos vindos de
  planilha geram relatório igual aos de hoje. Campo vazio não vira linha
  — quase metade do histórico não tem responsável preenchido, e uma
  página de "Por: —" seria pior que um texto mais curto. A única
  mudança no backend foi aceitar `limit=todas` em
  `/atualizacoes/recent-by-client/:nome`, que antes travava em 50: o
  relatório do cliente existe justamente para mostrar tudo.

- **Padronização de sistemas e responsáveis**: o campo "Sistema" das
  atualizações era texto livre e tinha acumulado 144 grafias para 14
  sistemas (`B_NFE`, `B_vendas`, `B_areadocontador e B_importaXML`). Não
  era só feio: o relatório da aba Sistemas compara texto exato, então 60
  dos 370 clientes de B_NFe apareciam como "Nunca atualizado" só porque
  alguém tinha digitado `B_NFE`. Agora toda gravação — cadastro, edição e
  **importação de planilha** — passa por `services/normalizacao.js`, que
  casa o nome com o catálogo ignorando caixa, acento e pontuação. O campo
  Responsável segue a mesma ideia, sem lista fixa de pessoas: canoniza
  contra as grafias que já existem. O histórico antigo foi acertado de uma
  vez por `scripts/normalizar-historico.js`, com as mesmas funções.

- **Arquivar agendamentos concluídos** (aba Agendamentos): tarefa
  concluída há mais de 30 dias sai da lista sozinha — a varredura roda
  junto da listagem, sem agendador. Ela **não é apagada**: está no filtro
  de Status em "Arquivadas" (com a contagem no rótulo), continua contando
  no tempo médio de resolução por responsável do Resumo, e o botão
  "Reabrir" traz de volta como "A Fazer". Desarquivar reabre de propósito:
  como a varredura roda a cada listagem, uma tarefa que apenas saísse do
  arquivo continuando "Concluído" sumiria de novo no mesmo instante. O
  prazo está em `AGENDAMENTO_ARQUIVAR_DIAS` no `.env` — é regra da equipe
  inteira, não uma preferência de cada pessoa: o conteúdo da lista precisa
  ser o mesmo para todo mundo. Quem não quer esperar o prazo tem o botão
  "Arquivar" (ao lado de "Excluir Selecionada"), restrito a tarefas já
  "Concluído".

- **Configurações passam a ser da conta, não do navegador**: tema, cor de
  destaque, tamanho do texto, densidade, linhas por página, tela inicial e
  as demais opções do painel agora ficam no servidor
  (`usuario_preferencias`, via `GET`/`PUT /api/preferencias`), uma linha
  por conta. Antes viviam só no localStorage, e o efeito aparecia na hora
  errada: trocar de máquina, usar o Edge em vez do Chrome ou limpar os
  dados do site devolvia o app aos padrões — e num computador
  compartilhado as escolhas de uma pessoa recebiam a seguinte.

  O localStorage **continua sendo escrito**, agora como cache, e isso não é
  redundância: `theme-init.js` roda no `<head>`, antes do primeiro pixel, e
  precisa de uma resposta síncrona. Esperar uma requisição ali faria a
  página nascer no tema errado e trocar na cara de quem está olhando. O
  cache pinta na hora; as preferências da conta chegam alguns
  milissegundos depois e corrigem se divergirem. Quem entra numa conta
  diferente no mesmo navegador tem o cache limpo antes, para não herdar o
  tema de quem usou por último.

  Migração é invisível: na primeira vez que uma conta entra sem nada salvo
  no servidor, o que estava no localStorage daquele navegador vira as
  preferências dela. A única opção que **não** acompanha a conta é o aviso
  de falhas por notificação — depende da permissão que o navegador concede
  por aparelho, e sincronizá-la faria o painel dizer "ativado" numa máquina
  onde a permissão nunca foi pedida.

### 15/09/2026 — interface, acessibilidade e Configurações

- **Cabeçalho que acompanha a rolagem, busca visível e menu da conta.** O
  cabeçalho agora fica grudado no topo (com sombra e um respiro menor
  assim que sai do topo): numa tabela de duzentas linhas, rolar até o fim
  deixava a pessoa sem o nome da tela e sem nenhum botão, e a saída era
  rolar tudo de volta. Ao lado dele entrou um campo-botão **"Buscar…"**
  com o `Ctrl + K` escrito — o atalho existia desde a primeira versão e
  não aparecia em lugar nenhum da tela, e atalho que não aparece é atalho
  que só quem escreveu o código usa (o CSS dele já estava escrito há
  tempos; faltava o botão). No canto, o bloco de texto com o nome de quem
  está logado e os dois ícones sem rótulo (engrenagem e porta) viraram um
  alvo só: o avatar abre um menu com tema (três opções escritas por
  extenso), "Atualizar os dados desta tela", Configurações, Atalhos e
  Sair — este último em vermelho e separado por uma divisória, longe do
  que se clica sem pensar.

- **Atualizar os dados sem recarregar a página.** O cache que torna a
  troca de aba instantânea não tinha como ser dispensado: quando outra
  pessoa mexia no mesmo registro do outro lado da sala, só o F5 resolvia —
  e o F5 cobra o login, a rolagem e a aba aberta. Agora existe "Atualizar
  os dados desta tela", no menu da conta e na paleta de comandos.

- **Perfis de aparência** (Configurações > Aparência): **Equilibrado**,
  **Operação**, **Leitura** e **Alto contraste**, cada um com uma amostra
  desenhada em CSS. O painel tem dezoito ajustes, e quase ninguém quer
  decidir dezoito coisas — quer dizer "preciso caber mais linha na tela"
  e voltar ao trabalho. Um perfil leva ao padrão tudo que ele não
  menciona, de propósito: aplicado por cima de um tamanho de texto que
  sobrou de outro dia, entregaria uma tela que não é nem o perfil nem o
  que havia antes.

- **Dá para ver o que você mudou.** Cada ajuste fora do padrão ganha o
  selo "alterado" e um fio na borda; cada seção mostra quantos tem; o
  rodapé resume ("3 ajustes fora do padrão"). A pergunta "o que aqui
  dentro fui eu que mexi?" era impossível de responder sem lembrar de
  cada escolha feita meses atrás — e é a primeira pergunta de quem herda
  uma máquina configurada por outra pessoa. Junto veio **"Restaurar esta
  seção"** (o botão de restaurar era tudo ou nada, e "tudo" é caro demais
  para quem só quer desfazer a densidade) e o fim do `location.reload()`
  que o "Restaurar padrões" dava: o painel continua aberto, sem piscar a
  página inteira.

- **Exportar e importar preferências** (Configurações > Sistema): um
  arquivo `.json` com as dezesseis preferências, para deixar a máquina
  nova — ou a do colega — igual à sua sem refazer as escolhas na mão. A
  importação ignora em silêncio o que não reconhece (chave de uma versão
  mais nova, valor editado à mão) e diz quantas ficaram de fora, em vez
  de recusar o arquivo inteiro.

- **Seção nova: Acessibilidade.** **Contraste alto** reforça bordas e
  textos de apoio *por cima* do tema escolhido — quem precisa enxergar
  melhor não devia ter que abrir mão do tema que prefere; ele é escrito
  uma vez só no CSS, derivando as cores do próprio tema com `color-mix`,
  em vez de um bloco para escuro e outro para claro. **Superfícies:
  sólidas** desliga o vidro fosco (`backdrop-filter`), que é o efeito mais
  caro da tela e é recalculado a cada quadro do que passa por trás dele —
  ou seja, exatamente enquanto se rola uma tabela longa, numa máquina de
  escritório sem placa de vídeo dedicada. **Animações** veio de Aparência,
  onde estava sozinha.

- **Linhas alternadas (zebra) das tabelas viraram opção.** A faixa ajuda
  a não pular de linha numa tabela larga e atrapalha quando a linha já é
  tingida por outro motivo (o vermelho de "parado há muito tempo", em
  Resumo e Sistemas), porque as duas tintas se somam.

- **`Ctrl + ,` abre as Configurações** — o mesmo atalho do Windows, do
  macOS e do VS Code. Um atalho que a pessoa já traz aprendido de outro
  lugar é o único tipo que não precisa ser ensinado. Está na lista do
  `?` e ao lado do item no menu da conta.

- **Tela de login: mostrar a senha e aviso de Caps Lock.** A senha é
  digitada às cegas, e o erro mais comum não é esquecê-la, é digitá-la
  errado duas vezes seguidas sem nunca ver o que saiu. O Caps Lock ligado
  é a causa silenciosa de metade dos "minha senha parou de funcionar": a
  tecla que estragou a senha fica acesa num canto do teclado que ninguém
  olha.

- **Aviso de servidor fora do ar, com reconexão sozinha.** O servidor é um
  serviço do Windows numa máquina da rede, e ele reinicia (atualização do
  Gestor, reboot, queda do switch). Até agora isso era invisível para quem
  estava com o app aberto: a tela seguia mostrando os dados de antes — o
  que é o certo, dado velho é melhor que tela em branco —, mas nada dizia
  que eles tinham parado no tempo, e a descoberta vinha pelo pior caminho,
  clicando em "Adicionar" e recebendo um erro que não esclarecia se o
  problema era daquele registro ou de tudo. Agora uma faixa no topo avisa
  enquanto durar, tenta de novo a cada cinco segundos (e tem "Tentar
  agora"), some sozinha quando o servidor volta e, ao voltar, busca de novo
  os dados da tela aberta — enquanto ele esteve fora, outra pessoa pode ter
  mudado alguma coisa.

- **Densidade e contraste na paleta de comandos** (`Ctrl + K`): são os dois
  ajustes que se liga e desliga várias vezes por dia — a densidade quando a
  tabela da vez é longa, o contraste quando o sol bate na tela à tarde. Os
  outros dezesseis continuam só em Configurações, que é onde devem ficar:
  são decisões que se toma uma vez.

- **`Ctrl + B` recolhe e abre o menu lateral**, e cada aba mostra o próprio
  `Alt+N` ao passar o mouse. Recolher o menu é a única preferência que se
  quer mexer várias vezes no mesmo dia (mais coluna visível numa tabela
  larga, menu de volta para trocar de tela), e custava quatro cliques; o
  atalho numérico existia desde sempre e só aparecia no `title`, que só
  conta a mesma coisa depois de um segundo parado em cima — e ninguém para
  em cima de um menu que já sabe usar.

- **Aviso com "Desfazer" não encurta mais quando o mouse passa por cima.**
  Ele vive mais tempo que um aviso comum de propósito; passar o mouse (e
  sair) reagendava a saída com a duração padrão, ou seja, o gesto de ir até
  o botão era justamente o que tirava tempo de usá-lo. O aviso agora também
  para o relógio quando recebe foco pelo teclado — sem isso ele podia sumir
  com o foco dentro dele, no meio da ação que a pessoa ia desfazer.

- **Lembretes no título da aba do navegador** (`(2) Clientes · Gestor de
  Atualizações`). O Gestor passa boa parte do dia numa aba de fundo, atrás
  do ERP: a faixa de lembretes só alcança quem está olhando a tela, e quem
  está olhando é justamente quem menos precisa ser lembrado. O número no
  título é a única parte do app que aparece na barra de tarefas do Windows.

- **A faixa de "sem conexão" também escuta o navegador.** O `offline` do
  próprio navegador chega na hora em que o cabo sai ou o Wi-Fi cai, sem
  esperar nenhuma requisição falhar. O caminho de volta continua sendo um
  só: quem apaga a faixa é a resposta do servidor, não o palpite do
  navegador — o Wi-Fi voltar não quer dizer que o servidor esteja de pé.

- **Correção de texto que tinha virado mentira:** o painel dizia "valem
  só para este navegador" desde antes de as preferências passarem a ser
  gravadas na conta (11/09). Agora diz o que acontece de verdade —
  "acompanham a sua conta em qualquer máquina".

### 22/09/2026

- **Dois ajustes no gráfico de "Tendência Mensal de Atualizações"
  (`LineChart`).** O `cursor: crosshair` no SVG duplicava o crosshair que o
  componente já desenha (linha vertical + ponto + tooltip): em telas de
  alto DPI o cursor nativo do SO aparecia como uma cruz grande e sem
  relação com a escala do gráfico. Removido — o overlay próprio já basta.
  Também o rótulo do valor do último ponto (`line-chart__valor-fim`)
  ficava perto demais do halo desse ponto (r:14) com o offset antigo de
  10px, sobrepondo o número e lendo como "número cortado"; o offset subiu
  para 22px, com um piso (`padT + 10`) para não colidir com o topo do
  gráfico quando esse ponto está perto do máximo do eixo Y.
