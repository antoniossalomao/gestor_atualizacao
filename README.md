# Gestor de Atualizações de Clientes — versão web

Reescrita em Node.js (backend) + JavaScript puro (front-end) do app
desktop original (`../gestor`, Python/Tkinter). Faz a mesma coisa —
controlar atualizações de sistemas em clientes, uma agenda de tarefas
internas e o cadastro de clientes — só que agora como um servidor web,
acessível por várias pessoas ao mesmo tempo, cada uma com seu próprio
login.

O projeto Python original continua na pasta acima (`../gestor`), intacto,
como referência.

## O que mudou em relação ao app desktop

- **Login multiusuário.** O app original era de uso individual (um
  `.exe`, sem conceito de conta). Agora cada pessoa da equipe tem seu
  próprio usuário e senha.
- **Servidor em vez de aplicativo instalado.** Em vez de rodar um `.exe`
  na máquina de cada pessoa, um servidor roda em um lugar só (um PC, um
  servidor da empresa, ou uma nuvem) e todo mundo acessa pelo navegador.
- **Mesmo banco de dados (SQLite), mesmas regras de negócio** — nome de
  cliente único, renomear cliente propaga o novo nome para o histórico,
  backup automático a cada início do servidor, etc. Ver a tabela abaixo
  e [docs/DOCUMENTACAO_CONSOLIDADA.md](docs/DOCUMENTACAO_CONSOLIDADA.md#22-arquitetura-do-código)
  para como o código está organizado.

### Onde cada parte do app original foi parar

| Python (`../gestor`) | Node (aqui) |
|---|---|
| `config.py` | `server/src/config/constants.js` + `client/js/config.js` |
| `database.py` (`Database`, `*Repository`) | `server/src/database/*.js` |
| `validation.py` | `server/src/services/validation.js` (+ checado de novo no front-end, `client/js/core/date.js`, só para feedback instantâneo) |
| `theme.py` | `client/css/theme.css` |
| `dialogs.py` | `client/js/core/Modal.js` |
| `widgets.py` | `client/js/core/{Autocomplete,SortableTable,Toast,debounce}.js` |
| `main_window.py` (`App`) | `client/js/core/App.js` + `server/src/Server.js` |
| `views/*.py` | `client/js/views/*.js` |
| backup automático | `server/src/database/Database.js` (`_backup`/`restoreFrom`) |
| _(não existia)_ | login multiusuário: `server/src/services/AuthService.js`, `client/js/views/LoginView.js` |
- **Responsável pré-preenchido** nos formulários de Atualização e
  Agendamento com o nome de quem está logado (continua editável), e com
  autocompletar (sugere nomes já usados, igual o campo Cliente).
- **Aba Histórico**, nova: registra quem criou/editou/excluiu cada
  cliente, atualização, agendamento, sistema e conta de usuário, e quem
  restaurou cada backup — importante agora que várias pessoas usam o
  mesmo sistema (o app original, de uso individual, não precisava disso).
- **Tela de Usuários** (botão no cabeçalho): convidar ou remover contas
  pela própria interface, sem precisar de acesso ao servidor.
- **Paginação** nas listas que podem crescer bastante ao longo do tempo
  (Atualizações, Agendamentos, Clientes, Histórico) — só um "porém": a
  ordenação por coluna nessas quatro passou a ser calculada no servidor
  (pedindo a página já ordenada), em vez de reordenar na tela.
- **Segurança de servidor web**: cabeçalhos HTTP de proteção (`helmet`) e
  um limite de tentativas de login por IP — o app original, local e sem
  login, não precisava de nenhum dos dois.
- **Visual atualizado** (mesmo tema escuro, com tipografia, espaçamento e
  gráfico da aba Resumo revisados).
- **Aba Sistemas**, nova: filtra clientes por sistema (ex.: NFCe) e por
  uma data de corte opcional, para achar quem ficou pra trás depois de
  uma mudança grande de um sistema numa certa data.
- **Lembrete de agendamento**: um aviso aparece no topo do app ao logar
  quando existem tarefas da aba Agendamentos vencidas ou vencendo hoje.
- **Notificação no Discord**: opcional (`DISCORD_WEBHOOK_URL` no `.env`)
  — avisa um canal a cada atualização nova cadastrada.
- **Status "Sem resposta"** na aba Agendamentos, para quando o cliente
  não responde ao contato agendado.
- **Resumo** agora também mostra atualizações por sistema, além de por
  responsável.

## Funcionalidades adicionadas — set/2026

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

## Estrutura

```
web/
  server/    backend (Express + SQLite via better-sqlite3)
  client/    front-end (HTML/CSS/JavaScript puro, sem framework nem build)
  docs/      documentação de arquitetura
```

## Como rodar (desenvolvimento)

Requer Node.js 18 ou mais recente.

```powershell
cd web/server
npm install
Copy-Item .env.example .env
npm run dev
```

Abra `http://localhost:3000` no navegador. Na primeira vez, o próprio
app mostra uma tela para criar a conta de administrador (não precisa
editar arquivo nenhum nem rodar comando extra para isso).

`npm run dev` reinicia o servidor sozinho a cada alteração de arquivo
(via `nodemon`). Para produção, use `npm start`.

### Usando o banco de dados que você já tem

Se você já usa o app desktop e quer continuar com os mesmos dados, copie
o `gestao.db` dele para dentro de `web/server/data/` (ou aponte a
variável `DB_PATH` do `.env` direto para o arquivo original) — o schema
é compatível, nada precisa ser convertido.

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

## Backup e restauração

Igual ao app original: uma cópia do `gestao.db` é feita automaticamente
na pasta `server/data/backups/` toda vez que o servidor é ligado
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
# (botão direito no ícone do PowerShell > "Executar como administrador"):
cd web
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

## Limitações conhecidas desta primeira versão

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

Rode `npm audit` periodicamente dentro de `web/server`. Uma dependência
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
