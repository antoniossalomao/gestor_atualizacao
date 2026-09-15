# Gestor de Atualizações

Painel web para controlar as atualizações de sistemas instalados em
clientes: o que foi atualizado, em quem, por quem e quando. Nasceu de uma
necessidade concreta — uma equipe pequena atendendo centenas de clientes,
cada um com uma combinação diferente de sistemas instalados, e nenhum
lugar confiável para registrar o que já tinha sido feito em cada um.

Roda como um servidor na rede da empresa; a equipe acessa pelo navegador,
cada pessoa com seu próprio login.

**Stack:** Node.js + Express + SQLite (via `better-sqlite3`) no servidor, e
HTML/CSS/JavaScript puro no navegador — **sem framework e sem etapa de
build**. Não há webpack, nem bundler, nem passo de compilação: o que está em
`client/` é exatamente o que o navegador executa. Para uma equipe pequena
que precisa conseguir corrigir um bug abrindo um arquivo, essa foi uma
escolha deliberada, não uma limitação.

## O que ele faz

**Atualizações** — o registro central. Cada linha é um atendimento: cliente,
sistemas atualizados, versão, responsável, data, motivo, quantas máquinas e
observações. Busca por qualquer campo, filtro por responsável e por período,
seleção em lote (`Shift` + clique em duas linhas marca tudo entre elas),
importação e exportação em `.xlsx`, e **"Gerar Relatório"**, que monta o texto
do atendimento pronto para colar num chamado.

**Clientes** — cadastro com código, cidade, grupo/rede (para clientes com
várias unidades sob a mesma bandeira) e quais sistemas cada um usa. O botão
**Acessos** guarda os IDs de acesso remoto de cada máquina do cliente, com
botão de copiar ao lado de cada um.

**Agendamentos** — agenda das tarefas internas ("atualizar o cliente X"), com
status, horário e responsável. Um aviso aparece no topo do app ao entrar
quando há tarefas vencidas ou vencendo hoje. Uma tarefa concluída pode virar
uma Atualização já pré-preenchida, e tarefas concluídas há mais de um mês
saem da lista sozinhas (continuam no filtro "Arquivadas").

**Resumo** — quantas atualizações no mês, por responsável e por sistema,
tendência dos últimos 12 meses, quantos clientes estão em dia e quantos
estão para trás, e o tempo médio que uma tarefa leva entre ser criada e ser
concluída, por pessoa.

**Sistemas** — responde "quais clientes de NFCe ainda não atualizaram desde
a mudança grande de tal data?". Filtra por sistema e por uma data de corte.

**Consulta** — a ficha de um cliente: dados de cadastro, sistemas, acessos
remotos e as últimas atualizações dele.

**Histórico** — trilha de auditoria: quem criou, editou ou excluiu cada
cliente, atualização, agendamento, sistema e conta, e quem restaurou cada
backup. Com várias pessoas mexendo no mesmo banco, é o que responde "quem
mudou isso?".

**Distribuição e Versões** — o painel do agente de atualização automática
(um serviço em C#/.NET que roda no servidor do cliente e aplica as
atualizações do ERP sozinho). Prepara e publica pacotes de versão, e mostra
a situação de cada agente em campo. O agente vive em
[repositório próprio](https://github.com/antoniossalomao/atualizador_automatico).

## Detalhes que valem menção

- **Login multiusuário** com dois papéis (administrador e usuário comum). A
  primeira conta é criada pela própria tela, na primeira vez que o servidor
  sobe — sem editar arquivo nem rodar comando.
- **Backup automático** a cada início do servidor, com verificação de
  integridade (`PRAGMA integrity_check`) logo depois — um backup corrompido
  aparece na tela de Backups em vez de ser descoberto na hora de precisar
  dele. Restauração por botão, sem acesso ao servidor.
- **Preferências por conta**, não por navegador: tema, cor de destaque,
  tamanho do texto, densidade das tabelas e o resto acompanham a pessoa em
  qualquer máquina.
- **Nomes de sistema e de responsável são padronizados na gravação** —
  quem digitar `B_NFE` grava `B_NFe`, e `CAMILA` grava `Camila`. Sem isso, o
  relatório por sistema erra em silêncio (ver a seção de 11/09 abaixo, que
  conta como isso foi descoberto).
- **Notificação no Discord**, opcional: avisa um canal a cada atualização
  nova, e quando um agente em campo fica offline ou reporta erro.
- **Paginação e ordenação no servidor** nas listas que crescem
  (Atualizações, Agendamentos, Clientes, Histórico).
- **Proteções de servidor web**: cabeçalhos do `helmet`, CSP sob medida,
  limite de tentativas de login por IP e comparação de token em tempo
  constante nas rotas do agente.

## Estrutura

```
server/    backend (Express + SQLite via better-sqlite3)
  src/controllers/   rotas HTTP -- só traduzem requisição em chamada de serviço
  src/services/      regras de negócio
  src/database/      um repositório por tabela; único lugar que escreve SQL
client/    front-end (HTML/CSS/JavaScript puro, sem framework nem build)
  js/views/          uma tela por arquivo
  js/core/           peças reaproveitadas (tabela, modal, toast, tema...)
  js/api/            único lugar que chama fetch
docs/      documentação consolidada (.md + gerador do PDF)
```

## Como rodar (desenvolvimento)

Requer Node.js 18 ou mais recente.

```powershell
cd server
npm install
Copy-Item .env.example .env
npm run dev
```

Abra `http://localhost:3000` no navegador. Na primeira vez, o próprio
app mostra uma tela para criar a conta de administrador (não precisa
editar arquivo nenhum nem rodar comando extra para isso).

`npm run dev` reinicia o servidor sozinho a cada alteração de arquivo
(via `nodemon`). Para produção, use `npm start`.

### Usando um banco que você já tem

Para começar com dados que já existem, copie o `gestao.db` para dentro de
`server/data/`, ou aponte a variável `DB_PATH` do `.env` direto para o
arquivo onde ele estiver. Nada precisa ser convertido: as migrações rodam
sozinhas a cada início do servidor e são idempotentes — tabelas e colunas
que faltarem são criadas, o que já existe fica como está.

## Variáveis de ambiente (`.env`)

Veja `server/.env.example` para a lista completa, com explicação de cada
uma. As principais:

| Variável | Para que serve |
|---|---|
| `PORT` | Porta em que o servidor escuta (padrão 3000). |
| `DB_PATH` | Caminho do arquivo `gestao.db`. |
| `SESSION_SECRET` | Texto usado para assinar o cookie de login — troque por um valor aleatório em produção. |
| `SESSION_SECURE` | `true` quando o servidor roda atrás de HTTPS. |
| `DISCORD_WEBHOOK_URL` | Opcional. Quando configurada, avisa um canal do Discord a cada atualização nova cadastrada, e também quando um agente do Atualizador automático fica offline/com erro. |
| `ALERTA_AGENTES_INTERVALO_MINUTOS` | De quanto em quanto tempo checar a situação dos agentes (padrão 15). Só tem efeito com `DISCORD_WEBHOOK_URL` configurada. |

## Contas de usuário

A primeira conta, criada na primeira vez que o servidor sobe direto pela
tela, vira automaticamente **administrador**. Depois disso, qualquer
pessoa já logada pode convidar outras contas pelo botão **Usuários** no
cabeçalho — não é preciso acesso ao servidor nem rodar nada pelo
terminal. **Remover** uma conta, porém, só administradores podem fazer.
As demais travas continuam valendo para todo mundo: ninguém pode remover
a própria conta enquanto logado com ela, nem a última conta que resta.

Qualquer pessoa logada pode **trocar a própria senha** pela tela de
Usuários (pede a senha atual, para confirmar que é o dono da conta mesmo
com a sessão aberta). O sistema também guarda o **último login** de cada
conta, visível na mesma tela — dá para ver quem de fato usa o sistema,
não só quem tem conta cadastrada.

### Recuperando acesso (ninguém consegue mais entrar)

Se a única conta administradora esquecer a senha, não há como recuperar
pela própria tela de login (de propósito — não existe envio de e-mail
configurado). Com acesso à máquina onde o servidor roda (ou a uma cópia
do `gestao.db`), rode a partir da pasta `server`:

```powershell
npm run resetar-senha -- <usuario> "<nova senha>"
```

Isso redefine a senha direto no banco, sem precisar saber a antiga. Veja
`resetar-senha.js` para os detalhes.

## Backup e restauração

Uma cópia do `gestao.db` é feita automaticamente na pasta `server/data/backups/` toda vez que o servidor é ligado
(mantém as 10 mais recentes). O botão **Backups** no cabeçalho do app
lista esses pontos no tempo e permite restaurar um deles — a página
inteira recarrega depois de restaurar, para garantir que nenhuma tela
fique mostrando dado antigo.

## Implantação (deixar acessível para a equipe)

O código não decide isso por você — depende de onde e para quem o app
vai ficar disponível:

- **Só na rede local (escritório):** rode `npm start` num PC/servidor
  que fique ligado, e o resto da equipe acessa por `http://IP-DA-MAQUINA:3000`
  (descubra o IP com `ipconfig`). Mais simples, mas só funciona dentro
  da mesma rede.
- **Pela internet:** recomendado colocar um proxy reverso na frente
  (ex.: [Caddy](https://caddyserver.com/) ou Nginx) cuidando do HTTPS, e
  apontá-lo para a porta do Node. Nesse caso, defina `SESSION_SECURE=true`
  no `.env`. Sem HTTPS, o login trafega sem criptografia — não exponha
  a porta do Node direto na internet sem isso.

## Rodar como serviço do Windows (recomendado)

`Iniciar Gestor.bat` roda o servidor numa janela de console em primeiro
plano: se a janela fechar sem querer, o processo travar ou a máquina
reiniciar, a equipe inteira fica sem o painel até alguém notar e abrir a
janela de novo na mão. Para produção (a máquina que fica ligada
atendendo a equipe), instale como serviço do Windows via
[NSSM](https://nssm.cc/) — sobe sozinho com o Windows e **reinicia
sozinho se cair**.

```powershell
# Uma vez só, num PowerShell aberto como Administrador
# (botão direito no ícone do PowerShell > "Executar como administrador"),
# a partir da raiz do repositório:
.\instalar-servico.ps1
```

O script é idempotente (rodar de novo reinstala do zero, sem duplicar) e
faz tudo sozinho: baixa o NSSM se não estiver instalado, para uma
instância manual que porventura já esteja rodando na mesma porta, cria o
serviço `GestorAtualizacoes` apontando pro `node.exe`/`server.js`
corretos, com log em `server/logs/` (`service-out.log`/`service-err.log`,
rotacionado por tamanho pra um arquivo não crescer indefinidamente), e
liga o serviço.

```powershell
Get-Service GestorAtualizacoes                              # status
Restart-Service GestorAtualizacoes                           # reiniciar
Get-Content server\logs\service-out.log -Tail 50 -Wait        # acompanhar log
```

Para desinstalar (volta a rodar só pelo `Iniciar Gestor.bat`), também como
Administrador: `.\desinstalar-servico.ps1`. Nada do projeto é apagado —
só o registro do serviço no Windows.

Precisa ser rodado elevado porque criar/remover serviço do Windows exige
privilégio de administrador — o `#Requires -RunAsAdministrator` no topo
dos dois scripts recusa a execução sem elevação, com uma mensagem clara,
em vez de falhar pela metade.

### Pendências conhecidas do serviço (set/2026)

Duas coisas que `instalar-servico.ps1` ainda não resolve, identificadas
depois de instalar de verdade — nenhuma delas impede o uso, mas valem
correção numa próxima passada pelo script:

- **Roda como `LocalSystem`.** O script não define `ObjectName` na
  instalação, então o NSSM usa o padrão dele — a conta mais privilegiada
  do Windows (controle total da máquina). O servidor nunca chama
  processo externo (sem `child_process`/`spawn`, só `.exec()` do SQLite),
  só precisa ler/escrever a própria pasta e escutar uma porta — não
  precisa de SYSTEM pra nada disso. Numa app que recebe upload de
  arquivo pela rede, isso importa: uma vulnerabilidade de execução
  remota numa dependência, no cenário atual, dá acesso de SYSTEM à
  máquina inteira. O ideal é uma conta virtual por serviço
  (`NT SERVICE\GestorAtualizacoes`, recurso nativo do Windows desde o
  Vista/2008 — sem senha pra gerenciar) com permissão NTFS só na pasta
  do projeto.
- **Log rotacionado, mas nunca podado.** `AppRotateBytes` evita um único
  arquivo crescer sem limite, mas o NSSM não apaga os arquivos já
  rotacionados (`service-out-<timestamp>.log`) — eles se acumulam pra
  sempre em `server/logs/`. Na prática o volume de log deste app é
  pequeno (bytes por dia), então isso não vira problema por muito tempo,
  mas seria bom ter uma tarefa agendada apagando rotações com mais de
  ~90 dias.

## Limitações conhecidas

- Só dois níveis de permissão (administrador e usuário comum) — não há
  papéis mais granulares (ex.: alguém que só pode ver, sem editar).
- Sem sincronização em tempo real: se duas pessoas estiverem com o app
  aberto ao mesmo tempo, cada uma vê os dados atualizados ao trocar de
  aba (o app busca de novo do servidor nesse momento), não
  instantaneamente enquanto a outra pessoa edita algo.
- Banco de dados continua sendo SQLite (com `journal_mode=WAL`, que
  aguenta bem várias leituras e escritas moderadas de uma equipe
  pequena/média). Para uso muito intenso e concorrente, a migração
  natural seria para PostgreSQL — não feita nesta versão.

## Segurança das dependências

Rode `npm audit` periodicamente dentro de `server/`. Uma dependência
(`connect-sqlite3`, usada por outros projetos para guardar sessão de
login) foi deliberadamente evitada aqui porque, no momento em que este
projeto foi criado, ela trazia uma cadeia de dependências (`sqlite3` →
`node-gyp` → `tar`) com vulnerabilidades conhecidas nas ferramentas de
build. Em vez dela, as sessões são guardadas com uma classe própria e
pequena (`server/src/database/SqliteSessionStore.js`), usando a mesma
biblioteca (`better-sqlite3`) que o resto do app já usa.

### Atualização de dependências e endurecimento — set/2026

Todas as dependências de produção foram atualizadas para a major mais
recente de cada uma (nenhuma mudança de código do projeto foi necessária
além do que está listado abaixo — o código já não usava nenhuma API
removida entre as majors):

| Pacote | Antes | Depois |
|---|---|---|
| `express` | 4.19 | **5.2** |
| `bcryptjs` | 2.4 | **3.0** |
| `better-sqlite3` | 11.3 | **13.0** |
| `dotenv` | 16.4 | **17.4** |
| `helmet` | 7.1 | **8.3** |
| `multer` | 2.0 | **2.3** |
| `express-session` | 1.18 | **1.19** |

**Por que valia a pena, especificamente o `express`:** era a única forma
de fechar a última vulnerabilidade moderada do `npm audit` (`qs`, via
`express@4`, que trava a dependência em `qs ~6.15.1` — não existe 4.x
mais novo que resolva isso). Antes de migrar, cada rota de
`routes/index.js` foi conferida contra as mudanças do Express 5 (parser
de query string, sintaxe de rota do `path-to-regexp`, assinatura de
handler de erro) — nenhuma usava os padrões que mudaram (sem
wildcard `*`, sem parâmetro opcional `:x?`, sem query aninhada/array,
sem `res.json(status, obj)` nem `req.param()`), então a migração não
exigiu nenhuma mudança de rota.

**O que mudou de fato no código, por causa do endurecimento de CSP feito
junto (não das majors em si):** o script inline de tema no `<head>` de
`client/index.html` foi extraído para `client/js/theme-init.js`, e
`Server.js`/`requireAgent.js` ganharam uma CSP sob medida e comparação
de token em tempo constante — ver histórico do git para o antes/depois.

**Deixado de fora, de propósito:** a vulnerabilidade restante do
`npm audit` é em `uuid`, puxada pelo `exceljs`. Não há `exceljs` mais
novo que resolva isso — `npm audit fix --force` "resolveria" voltando
para `exceljs@3.4.0`, uma downgrade de major, não uma correção. Fica
para quando alguém revisar se vale a pena travar o `exceljs` numa versão
mais antiga só por causa dessa dependência transitiva.

**Testado** (rodando o servidor de verdade, não só lido o código): login
completo (bcrypt hash/compare), CRUD via API autenticada em Clientes,
Sistemas, Atualizações e Agendamentos, upload de pacote via `multer`
(criação de versão em rascunho, com o arquivo caindo em
`server/data/packages/`) e exclusão (arquivo junto), exportação `.xlsx`
(`exceljs`, inalterado), rotas do agente C# com token certo/errado/
ausente, trava de "não é possível excluir a versão no ar", acesso
sem sessão bloqueado (401), e a CSP presente em todas as respostas. Feito
com uma conta de teste temporária, criada e removida direto no banco (sem
tocar em conta real de ninguém), e todos os registros de teste
apagados ao final.

### `.env.bak` estava commitado no git — corrigido em set/2026

O `.gitignore` só tinha a regra `.env` (nome exato); um `.env.bak` real
chegou a ser commitado (`git log -- server/.env.bak`: "Snapshot antes da
migração para Turso (rollback point)", 18/08/2026) e passava batido por
essa regra. O `SESSION_SECRET` dentro dele era só o valor de exemplo
(`troque-este-valor-em-producao`, o mesmo texto público do
`.env.example`) — não havia segredo de verdade exposto desta vez, mas o
próximo `cp .env .env.bak` de alguém, como hábito de backup local, teria
vazado o `SESSION_SECRET`/`AGENT_API_TOKEN` reais no histórico do git.

**Corrigido:** `.gitignore` agora ignora `.env.*` (com exceção explícita
de `.env.example`, que precisa continuar versionado), e o `.env.bak`
antigo foi tirado do índice do git (`git rm --cached`) — o arquivo
continua no disco de quem já o tinha, só não é mais rastreado. Nenhum
segredo precisou ser rotacionado, porque não havia nenhum de verdade
neste arquivo.


## Histórico de mudanças

As seções abaixo registram o que foi acrescentado em cada etapa, com o
motivo de cada decisão — inclusive as que deram errado antes de dar certo.

### Setembro de 2026

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
  `copyToClipboard` em `client/js/core/html.js`), o modal fica aberto
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

## Documentação

[`docs/DOCUMENTACAO_CONSOLIDADA.md`](docs/DOCUMENTACAO_CONSOLIDADA.md) —
documento único que cobre a arquitetura do painel e do agente de
atualização, as auditorias técnicas e o histórico de correções. O PDF ao
lado dele é gerado do próprio `.md` (`cd docs && npm install && npm run pdf`)
e nunca é editado à mão.

## Licença

Proprietária — ver [LICENSE](LICENSE). O código está publicado para leitura;
usar, copiar, modificar ou incorporar em outro projeto exige autorização por
escrito.
