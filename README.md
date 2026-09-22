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

- **Controle de acesso baseado em papéis (RBAC)** com três perfis:
  **Administrador** (gestão de usuários, publicação de versões e restauração de backups),
  **Operador** (rotina operacional de atendimentos, clientes e agendamentos) e
  **Consulta** (leitura, relatórios e exportação).
- **Backup automático e restauração blindada** a cada início do servidor, com
  verificação de integridade (`PRAGMA integrity_check`). A restauração exige
  privilégio de administrador, revalidação da senha atual e confirmação por texto,
  além de invalidar sessões ativas e disponibilizar download preventivo do banco.
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
README.md              este arquivo -- o que o sistema faz e como rodar
CONTRIBUTING.md        como trabalhar no código: onde pôr cada coisa, o que não quebrar
SECURITY.md            o que protege o quê, e os limites assumidos de propósito
CHANGELOG.md           diário de decisões, em ordem cronológica
CLAUDE.md              instruções para agentes de IA que trabalhem aqui
package.json           scripts do projeto inteiro (test, check, start) -- ver "Como rodar"

server/                backend (Express + SQLite via better-sqlite3)
  server.js              ponto de entrada: só lê o .env e manda o Server subir
  src/Server.js          classe raiz: abre o banco, monta tudo, liga no Express
  src/routes/            o mapa de URLs -- o único lugar que sabe qual caminho vai pra qual controller
  src/controllers/       rotas HTTP -- só traduzem requisição em chamada de serviço
  src/services/          regras de negócio
  src/database/          um repositório por tabela; único lugar que escreve SQL
  src/middlewares/       autenticação, papéis, limite de tentativas, tratamento de erro e 404
  src/shared/            peças usadas por MAIS DE UMA camada (erros, paginação, ordenação, validação)
  src/config/            constantes do domínio
  tests/                 testes do servidor (node:test, sem framework externo)
  tsconfig.json          escopo da verificação de tipos do núcleo puro

client/                front-end (HTML/CSS/JavaScript puro, sem framework nem build)
  index.html             a única página; todo o resto é desenhado por JS dentro dela
  js/main.js             ponto de entrada: instancia o ApiClient e o App
  js/api/                único lugar que chama fetch
  js/app/                o "esqueleto" do app: App, View, rota, tema, aparência, preferências, cache
  js/components/         peças de UI reaproveitáveis (modal, toast, tabela, paginação...)
  js/components/charts/  gráficos em SVG escritos à mão (barras, linha, pizza)
  js/views/              uma tela por arquivo
  js/domain/             vocabulário do negócio, SEM tocar no DOM (status de agente, relatório, papéis)
  js/utils/              utilidades genéricas (datas, HTML, cores, ícones, debounce)
  css/                   theme.css (tokens de cor/tipografia) + components.css (o resto)
  tests/                 testes do que dá pra testar sem navegador
  tsconfig.json          escopo da verificação de tipos (não compila nada -- ver ADR-0006)

docs/                  a documentação longa -- ver docs/README.md para o índice
  adr/                   decisões de arquitetura, uma por arquivo
  OPERACAO.md            runbook por sintoma: deu problema agora, o que fazer
```

A divisão do `client/js/` segue uma regra só, fácil de aplicar na hora de criar
um arquivo novo: **`utils/` não conhece o negócio, `domain/` não conhece o DOM,
`components/` não conhece a tela em que está, `views/` conhece as duas coisas, e
`app/` é o que segura tudo isso junto.** Antes existia uma pasta `core/` única
com 35 arquivos misturando as cinco categorias -- ainda funcionava, mas não
respondia "onde eu ponho isso?" para quem chega.

## Como rodar (desenvolvimento)

Requer Node.js 20.6 ou mais recente (a versão usada em produção e no CI é a 22).

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

### Os comandos, a partir da raiz de `web/`

Há um `package.json` na raiz que serve de atalho para os dois lados, para não
ser preciso lembrar em qual pasta cada comando roda:

```powershell
npm install        # traz só a ferramenta de verificação de tipos
npm run install:all # dependências do servidor
npm start          # produção
npm run dev        # desenvolvimento, com reinício automático
npm test           # servidor + front-end
npm run check      # verificação de tipos (não compila nada -- ver ADR-0006)
```

O front-end **não tem dependência nenhuma** (ver
[ADR-0001](docs/adr/0001-sem-framework-e-sem-build.md)): não há o que instalar
em `client/`.

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

## Contas de usuário e Controle de Acesso (RBAC)

O sistema conta com três perfis de acesso bem definidos:

- **Administrador (`admin`):** Acesso completo ao sistema. Pode convidar e remover usuários, alterar papéis, restaurar e baixar backups, publicar e excluir versões, e configurar tokens de integração.
- **Operador (`operador`):** Voltado para a equipe de suporte e implantação no dia a dia. Pode cadastrar e editar atendimentos, clientes, agendamentos e cadastrar rascunhos de versão.
- **Consulta (`consulta`):** Apenas leitura. Pode navegar em relatórios, resumos e tabelas, além de exportar dados para Excel. Não possui permissão para criar, editar ou excluir registros.

A primeira conta criada na inicialização inicial é automaticamente **administradora**. Posteriormente, apenas administradores podem cadastrar novas contas ou alterar permissões. Todas as opções de gestão de segurança (Usuários, Backups e Credenciais da API) estão centralizadas e organizadas dentro do painel **Configurações**.

Travas de segurança protegem o sistema contra exclusão ou rebaixamento acidental do último administrador existente. Qualquer pessoa logada pode **trocar a própria senha** pelo painel de Usuários (exige a confirmação da senha atual).

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
(mantém as 10 mais recentes). O gerenciamento de backups é restrito a administradores.

A restauração de backup conta com proteção operacional reforçada:
1. **Download Preventivo:** O administrador pode baixar o banco de dados atual (`.db`) diretamente pelo painel antes de qualquer intervenção, além de baixar cópias individuais de qualquer backup anterior.
2. **Confirmação Dupla:** Exige a digitação manual da palavra `RESTAURAR` em caixa alta e a senha da conta de administrador atual.
3. **Invalidação de Sessões:** Ao restaurar, todas as sessões ativas são invalidadas no servidor, garantindo consistência total entre os usuários e o estado restaurado do banco.

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
- **Em container:** há um `Dockerfile` e um `docker-compose.yml` prontos —
  ver [Rodar em Docker](#rodar-em-docker-alternativa-ao-serviço-do-windows).

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

## Rodar em Docker (alternativa ao serviço do Windows)

Mesmo painel, empacotado. Faz sentido quando o app vai para uma máquina
Linux, ou quando se quer o servidor isolado do resto do que roda no PC —
não substitui o serviço do Windows acima, é a outra opção. Requer o
[Docker Desktop](https://www.docker.com/products/docker-desktop/) (no
Windows, ele usa o WSL 2).

### Primeira vez

**O `.env` precisa existir antes do primeiro `up`.** Isso não é preciosismo
de documentação: o `docker-compose.yml` monta `server/.env` como arquivo, e
quando o caminho de origem não existe o Docker cria uma **pasta** vazia com
esse nome. O servidor sobe assim mesmo, com os valores padrão — inclusive o
`SESSION_SECRET` de exemplo, que é público — e nada nos logs diz que foi
isso que aconteceu.

```powershell
cd web
Copy-Item server\.env.example server\.env
# Gere um segredo de verdade e cole no SESSION_SECRET do .env:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
docker compose up -d --build
```

Abra `http://localhost:3000`. A tela de criação do administrador aparece
igual, e as migrações rodam sozinhas no primeiro início.

### O dia a dia

```powershell
docker compose ps          # estado (procure "healthy")
docker compose logs -f     # acompanhar o log
docker compose restart     # aplicar mudança feita no .env
docker compose up -d --build   # depois de atualizar o código
docker compose stop        # parar sem apagar nada
```

O container tem `restart: unless-stopped`: volta sozinho depois de travar e
depois de a máquina reiniciar — é o que o serviço do Windows faz, pelo
outro caminho.

A verificação de saúde bate em `/api/auth/status` a cada 30 segundos. Ela
responde do banco, então `healthy` significa "o SQLite abriu e respondeu", e
não só "o processo está de pé".

### Onde ficam os dados

Em dois volumes do Docker (`gestor-data` e `gestor-logs`), **não** numa
pasta do Windows. É de propósito: o SQLite em modo WAL depende de travas de
arquivo que não funcionam de forma confiável através da tradução de sistema
de arquivos do Docker Desktop. Trocar a imagem (`up -d --build`) não mexe
nos volumes; os dados ficam.

Para tirar uma cópia para fora, use o **download de backup do próprio
painel** (Configurações → Backup), que é o caminho pensado para isso. Os
backups automáticos continuam acontecendo a cada início, dentro do volume.

### Trazer um `gestao.db` que já existe

O volume nasce vazio. Para começar com o banco que já está em uso, pare o
container e copie o arquivo para dentro dele:

```powershell
docker compose stop
docker cp server\data\gestao.db gestor-de-atualizacoes:/app/server/data/gestao.db
docker run --rm --user root --volumes-from gestor-de-atualizacoes alpine chown -R 1000:1000 /app/server/data
docker compose start
```

Copie **só** o `gestao.db`. Os arquivos `-wal` e `-shm` ao lado dele são
estado temporário de uma conexão aberta; se o servidor de origem foi parado
de forma organizada, o que importa já está no `.db`, e levar junto um `-wal`
de outra máquina só cria chance de inconsistência. O `sessions.sqlite`
também não vai: ele só guarda quem estava logado, e todo mundo entra de
novo.

Duas pegadinhas testadas na prática, e é por isso que a receita acima não é
a primeira que vem à cabeça:

- **`docker compose cp` recusa container parado** ("no container found for
  service") — por isso é `docker cp` simples, direto pelo nome do container
  (`gestor-de-atualizacoes`, fixado em `container_name` no compose), que
  funciona com o container parado ou rodando.
- **Toda cópia para dentro do container chega dona de `root`.** O processo
  roda como `node` (uid 1000) — sem o `chown` acima, o servidor sobe e cai
  na hora com `SqliteError: attempt to write a readonly database`. O
  `docker run --volumes-from` resolve isso sem precisar saber o nome do
  volume nomeado (que o Docker deriva do nome da pasta do projeto e muda se
  ela for renomeada).

### Atrás de um proxy reverso (HTTPS)

Com Caddy/Nginx na frente terminando o HTTPS, ajuste no `server/.env` —
não no `docker-compose.yml`, pelo motivo explicado no item seguinte:

| Variável | Valor | Por quê |
|---|---|---|
| `SESSION_SECURE` | `true` | Sem isso o cookie de login trafega sem exigir HTTPS. |
| `TRUST_PROXY` | `true` | Sem isso o Express enxerga só o IP do proxy, e com `SESSION_SECURE=true` ninguém consegue entrar. |
| `PUBLIC_URL` | `https://seu-dominio` | É o que monta os links de download enviados aos agentes. |

E troque o mapeamento de portas para `"127.0.0.1:3000:3000"`, de modo que
só o proxy alcance o Node.

### Duas armadilhas

- **Não mova variável do `.env` para `environment:` no compose.** O `dotenv`
  não sobrescreve variável que já veio do ambiente, então o que estiver no
  compose vence — e a tela *Configurações → Sistema → "Configuração da API"*,
  que grava no `.env`, passa a não ter efeito nenhum, sem mensagem de erro.
  `PORT` é a única exceção (não é editável por aquela tela, e fixá-la é o que
  mantém o mapeamento de portas válido).
- **O fuso está fixado em `America/Sao_Paulo`** (`TZ` no `Dockerfile`).
  Container sem fuso roda em UTC, e o app usa o relógio local para decidir o
  que é "hoje": das 21h à meia-noite, os agendamentos de amanhã apareceriam
  como atrasados. Se a equipe não estiver em São Paulo, mude ali.

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


## Documentação

| Documento | Para quem, e quando |
|---|---|
| Este README | Quem vai **usar** ou **instalar** o painel |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Quem vai **alterar o código**: como rodar, onde colocar cada coisa, o que não quebrar |
| [`SECURITY.md`](SECURITY.md) | O que protege o quê, onde ficam os segredos, e os limites assumidos de propósito |
| [`CHANGELOG.md`](CHANGELOG.md) | "Por que isso é assim?" — diário de decisões, em ordem cronológica |
| [`docs/README.md`](docs/README.md) | Índice dos documentos longos, e a regra de precedência quando dois discordarem |
| [`docs/OPERACAO.md`](docs/OPERACAO.md) | **Deu problema agora.** Runbook por sintoma: servidor fora do ar, ninguém entra, agente parado, restaurar backup |
| [`docs/adr/`](docs/adr/) | As decisões de arquitetura, uma por arquivo, com as alternativas descartadas |
| [`docs/DOCUMENTACAO_CONSOLIDADA.md`](docs/DOCUMENTACAO_CONSOLIDADA.md) | Documento único cobrindo painel + agente, auditorias técnicas e histórico de correções |
| [`docs/APRESENTACAO_EXECUTIVA_ATUALIZACAO_ERP.md`](docs/APRESENTACAO_EXECUTIVA_ATUALIZACAO_ERP.md) | Visão para a diretoria, sem detalhe técnico |

Os PDFs ao lado dos `.md` são gerados do próprio Markdown
(`cd docs && npm install && npm run pdf`) e **nunca** são editados à mão.

A documentação do agente C# fica no repositório dele — em especial
[`RISCOS-CONHECIDOS.md`](../atualizador/RISCOS-CONHECIDOS.md), que é leitura
obrigatória antes de mexer naquele lado.

### Qual documento responde o quê

- *"Como eu rodo isso?"* → este README.
- *"Onde eu ponho este arquivo novo?"* → `CONTRIBUTING.md`.
- *"Por que não usaram React?"* → `docs/adr/0001`.
- *"Por que existe uma classe de sessão escrita à mão?"* → `docs/adr/0003`.
- *"Quando isso mudou, e por quê?"* → `CHANGELOG.md`.
- *"Isso aqui é seguro?"* → `SECURITY.md`.
- *"Está fora do ar, e agora?"* → `docs/OPERACAO.md`.

## Licença

Proprietária — ver [LICENSE](LICENSE). O código está publicado para leitura;
usar, copiar, modificar ou incorporar em outro projeto exige autorização por
escrito.
