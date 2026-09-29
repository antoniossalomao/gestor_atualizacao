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
observações. Toolbar unificada com busca instantânea, filtro por responsável,
filtros de data recolhíveis com chips visíveis, menu **Mais ações** (com exportar
`.xlsx` e importar planilha com prévia antes de gravar), seleção em lote (`Shift` + clique em duas linhas marca tudo
entre elas) e relatórios estruturados (atendimento, situação e histórico do
cliente) com abas ágeis, cópia de texto limpo e impressão/salvar PDF.

Ao criar um atendimento, cada sistema informado recebe uma cópia da versão
oficial cadastrada em Sistemas. Alterar a versão oficial depois não muda essa
cópia: o cliente só recebe a nova versão ao registrar outro atendimento.
Editar ou desfazer a exclusão preserva as versões recebidas. Sistemas acrescentados
na edição ficam sem versão; use um novo atendimento para registrar uma atualização.
Histórico e importações antigos não recebem a versão oficial retroativamente.
Uma referência posterior à data do atendimento também não é atribuída.

A **importação de planilha** mostra antes uma prévia: linhas válidas, erros
(cliente em branco, data fora de dd/mm/aaaa — essas ficam de fora), avisos
(cliente sem cadastro, sistema fora do catálogo) e possíveis duplicidades
(mesmo cliente, data e sistemas), puladas por padrão. O lote grava numa
transação só: ou entra inteiro, ou nada entra.

**Clientes** — cadastro com código, cidade, grupo/rede compacto (para clientes
com várias unidades sob a mesma bandeira) e quais sistemas cada um usa. A ação
**Gerenciar acessos** na linha de cada cliente abre os identificadores de
acesso remoto de cada máquina, com cópia individual de cada um.

**Agendamentos** — agenda das tarefas internas ("atualizar o cliente X"), com
status, horário e responsável, organizada com criação rápida e toolbar unificada.
Filtros rápidos alternam entre tarefas Pendentes, Concluídas e Arquivadas.
Um aviso aparece no topo do app ao entrar quando há tarefas vencidas ou vencendo
hoje. Tarefas concluídas podem ser arquivadas manualmente ou saem da lista
principal automaticamente após o prazo configurado nas regras da equipe
(continuam disponíveis no filtro "Arquivadas").

**Resumo** — quantas atualizações no mês, por responsável e por sistema,
tendência dos últimos 12 meses (com zero nos meses vazios e comparação parcial
justa), card de situação das versões dos clientes (Em dia, Desatualizados,
Verificação pendente), indicador de clientes sem atualização há mais de N dias
e o tempo médio que uma tarefa leva entre ser criada e ser concluída, por pessoa.

**Sistemas** — consulta da situação de versões dos clientes e painel dedicado de
**Versões oficiais**. A consulta oferece busca rápida e filtros por status (Em dia,
Desatualizado, Nunca atualizado, Sem referência ou Sem informação) e por sistema,
com cartões de métricas sincronizados. O gerenciador de versões oficiais registra a data
de referência com autoria (quem alterou por último) e detecção de edição concorrente,
garantindo que referências não retroajam sobre atendimentos antigos (ADR-0008).

**Consulta** — a ficha completa de um cliente: cabeçalho com código, cidade e
grupo/rede, data da última atualização, componentes fixos (sem
falso status de atraso), acessos remotos com cópia direta por máquina, telemetria
de agentes isolada e linha do tempo das últimas atualizações com opção de copiar
relatório em texto limpo.

**Campanhas** — metas temporárias de versão: "todo cliente de B_NFe na
25/09/2026 até o dia 30". Mostra o progresso (atualizados, já agendados,
pendentes), a lista de clientes com filtros rápidos, cria o agendamento de
quem falta com um clique e exporta os pendentes em `.xlsx`. A baixa é
automática: registrar a atualização em Atualizações com a versão da meta (ou
mais nova) tira o cliente dos pendentes. Uma versão oficial nova em Sistemas
não muda a meta; encerrar a campanha congela o placar (ADR-0009).

**Administração** — restrita a administradores e organizada em 7 seções por finalidade:
1. **Pessoas e permissões** (usuários, perfis e permissões);
2. **Operação** (prazos para clientes desatualizados, arquivamento de tarefas e classificação de sistemas atualizáveis vs fixos);
3. **Dados** (exportação completa, importação em lote com prévia e download do banco);
4. **Integrações** (notificações no Discord com mensagem de teste e liga/desliga do Atualizador);
5. **Backups e recuperação** (cópias automáticas a cada inicialização, retenção, download e restauração protegida);
6. **Auditoria** (histórico completo de alterações por entidade e autor);
7. **Diagnóstico** (saúde do servidor, integridade do SQLite e métricas).
As regras valem imediatamente para toda a equipe, sem necessidade de reiniciar.

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
  tamanho e fonte do texto, densidade das tabelas e o resto acompanham a
  pessoa em qualquer máquina. Ficam na tela **Configurações** (rodapé do
  menu lateral, menu da conta ou `Ctrl + ,`), que abre por padrão em
  **Minha conta** e agrupa as opções em 6 seções (Minha conta, Trabalho
  diário, Notificações, Interface e acessibilidade, Regras da equipe, Sobre
  e ajuda), com perfis prontos, prévia ao vivo das tabelas e busca instantânea.
- **Notificações sob medida**: em Configurações › Notificações cada pessoa
  escolhe o que o sino conta (agendamentos atrasados, de hoje, situação dos
  agentes; da equipe ou só as suas), liga um som curto para pendência nova e
  define um horário silencioso (pode virar a noite; falhas de agente podem
  passar mesmo assim, ou chegar num resumo quando o silêncio acaba). A tela
  mostra o estado real da permissão de notificação do navegador, inclusive
  bloqueio. Em Trabalho diário, a aba com que o relatório abre e se ele fecha
  ao copiar.
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
  js/views/              uma tela por arquivo; views/administracao/ tem uma aba da Administração por arquivo
  js/templates/          marcação das telas, montada com a tag html (escapa tudo), SEM tocar no DOM
  js/domain/             vocabulário do negócio, SEM tocar no DOM (status de agente, relatório, papéis)
  js/utils/              utilidades genéricas (datas, HTML, cores, ícones, debounce)
  css/                   theme.css (tokens de cor/tipografia) + components.css (o resto)
  tests/                 testes do que dá pra testar sem navegador
  tsconfig.json          escopo da verificação de tipos (não compila nada -- ver ADR-0006)

docs/                  documentação detalhada, organizada por finalidade
  OPERACAO.md            runbook por sintoma: deu problema agora, o que fazer
  MELHORIAS.md           plano vigente e backlog histórico
  DOCUMENTACAO_CONSOLIDADA.md  arquitetura, decisões e revisão concluída
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
[ADR-0001](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0001): não há o que instalar
em `client/`.

### Usando um banco que você já tem

Para começar com dados que já existem, copie o `gestao.db` para dentro de
`server/data/`, ou aponte a variável `DB_PATH` do `.env` direto para o
arquivo onde ele estiver. Nada precisa ser convertido: as migrações rodam
sozinhas no início do servidor. Cada uma é numerada e roda uma vez só
(`PRAGMA user_version` guarda a última aplicada), numa transação; antes de
aplicar uma migração pendente, o servidor copia o banco para `backups/` —
essa cópia aparece na tela de Backups e pode ser restaurada por lá. Ver
[ADR-0007](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0007).

## Variáveis de ambiente (`.env`)

Veja `server/.env.example` para a lista completa, com explicação de cada
uma. As principais:

| Variável | Para que serve |
|---|---|
| `PORT` | Porta em que o servidor escuta (padrão 3000). |
| `DB_PATH` | Caminho do arquivo `gestao.db`. |
| `SESSION_SECRET` | Texto usado para assinar o cookie de login. **Obrigatório:** o servidor não sobe sem ele nem com o valor de exemplo do `.env.example`. Use um valor longo e aleatório. |
| `SESSION_SECURE` | `true` atrás do proxy HTTPS. No Docker vem fixo do `docker-compose.yml`; em desenvolvimento, deixe vazio. |
| `AGENT_API_TOKEN` | Chave compartilhada com os agentes do Atualizador. Para trocar, ver "Rotacionar o token dos agentes" em `docs/OPERACAO.md`. |
| `TRUST_PROXY` | `true` atrás do proxy HTTPS, junto com `SESSION_SECURE`. Mesmo caso: fixo no Docker, vazio em desenvolvimento. |

**Regras da equipe** (webhook do Discord, URL pública para os agentes, dias até
um cliente contar como desatualizado, dias até arquivar tarefa concluída,
cópias de backup, intervalo do alerta de agentes) **não moram no `.env`**:
ficam no banco e são editadas em **Administração**, valendo na hora, sem
reiniciar. `DISCORD_WEBHOOK_URL`, `PUBLIC_URL`,
`ALERTA_AGENTES_INTERVALO_MINUTOS` e `AGENDAMENTO_ARQUIVAR_DIAS` ainda são
lidas do `.env` uma única vez, na primeira subida, para trazer o que uma
instalação antiga já tinha configurado.

## Contas de usuário e Controle de Acesso (RBAC)

O sistema conta com três perfis de acesso bem definidos:

- **Administrador (`admin`):** Acesso completo ao sistema. Pode convidar e remover usuários, alterar papéis, restaurar e baixar backups, publicar e excluir versões, e configurar tokens de integração.
- **Operador (`operador`):** Voltado para a equipe de suporte e implantação no dia a dia. Pode cadastrar e editar atendimentos, clientes, agendamentos e cadastrar rascunhos de versão.
- **Consulta (`consulta`):** Apenas leitura. Pode navegar em relatórios, resumos e tabelas, além de exportar dados para Excel. Não possui permissão para criar, editar ou excluir registros.

A primeira conta criada na inicialização inicial é automaticamente **administradora**. Posteriormente, apenas administradores podem cadastrar novas contas ou alterar permissões. Usuários, backups e as regras da equipe ficam na tela **Administração**, que só administrador vê.

Travas de segurança protegem o sistema contra exclusão ou rebaixamento acidental do último administrador existente. Qualquer pessoa logada pode, em **Configurações → Conta**, trocar o próprio nome e a própria senha (exige a senha atual) e ver em que aparelhos a conta está aberta, encerrando os que não reconhecer.

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

Na rede, o painel **só atende por HTTPS** (decisão de 29/09/2026, P01 de
[`docs/MELHORIAS.md`](docs/MELHORIAS.md#plano-vigente)). O caminho é o
Docker: o `docker-compose.yml` sobe o painel e, na frente dele, um proxy
[Caddy](https://caddyserver.com/) que cuida do certificado. Ver
[Rodar em Docker](#rodar-em-docker) e [HTTPS](#https).

`npm start` e `npm run dev` fora do Docker atendem em HTTP puro, e **só na
própria máquina** (`http://localhost:3000`): os outros PCs recebem "conexão
recusada". Isso é para quem desenvolve, não para a equipe usar.

## Rodar em Docker

Mesmo painel, empacotado, com o proxy HTTPS na frente. É o jeito de
deixar o painel acessível para a equipe. Requer o
[Docker Desktop](https://www.docker.com/products/docker-desktop/) (no
Windows, ele usa o WSL 2).

### Primeira vez

**O `.env` precisa existir antes do primeiro `up`.** Isso não é preciosismo
de documentação: o `docker-compose.yml` monta `server/.env` como arquivo, e
quando o caminho de origem não existe o Docker cria uma **pasta** vazia com
esse nome. Sem `.env`, não há `SESSION_SECRET`, e o servidor **se recusa a
subir**: o container fica reiniciando, e `docker compose logs` mostra o motivo.
O mesmo acontece se o `SESSION_SECRET` continuar com o valor de exemplo
copiado do `.env.example`, que é público.

O **`web/.env`** (outro arquivo, o do compose) diz por qual endereço a
equipe vai acessar — ver [HTTPS](#https). Sem ele, o `docker compose up`
para com a mensagem "defina GESTOR_ENDERECO".

```powershell
cd web
Copy-Item server\.env.example server\.env
# Gere um segredo de verdade e cole no SESSION_SECRET do server\.env:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
Copy-Item .env.example .env
# Ajuste o GESTOR_ENDERECO do .env (nome ou IP do servidor)
docker compose up -d --build
```

Abra `https://` + o `GESTOR_ENDERECO` (ex.: `https://gestoratualizacao`). A
tela de criação do administrador aparece igual, e as migrações rodam
sozinhas no primeiro início. O navegador vai avisar do certificado até a
raiz ser instalada — ver [HTTPS](#https).

### O dia a dia

```powershell
docker compose ps          # estado (procure "healthy")
docker compose logs -f     # acompanhar o log
docker compose restart     # aplicar mudança feita no .env
docker compose up -d --build   # depois de atualizar o código
docker compose stop        # parar sem apagar nada
```

Os containers têm `restart: unless-stopped`: voltam sozinhos depois de
travar e depois de a máquina reiniciar.

A verificação de saúde bate em `/api/auth/status` a cada 30 segundos. Ela
responde do banco, então `healthy` significa "o SQLite abriu e respondeu", e
não só "o processo está de pé".

### Onde ficam os dados

No volume `gestor-data` do Docker, **não** numa
pasta do Windows. É de propósito: o SQLite em modo WAL depende de travas de
arquivo que não funcionam de forma confiável através da tradução de sistema
de arquivos do Docker Desktop. Trocar a imagem (`up -d --build`) não mexe
nos volumes; os dados ficam.

Para tirar uma cópia para fora, use o **download de backup do próprio
painel** (Administração → Backups), que é o caminho pensado para isso. Os
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

### Duas armadilhas

- **Regra da equipe não é variável de ambiente.** Pôr `DISCORD_WEBHOOK_URL`
  ou `PUBLIC_URL` no `environment:` do compose só vale na primeira subida
  (é quando o valor é importado para o banco); depois disso, quem manda é a
  tela Administração. Para mudar, mude lá.
- **O fuso está fixado em `America/Sao_Paulo`** (`TZ` no `Dockerfile`).
  Container sem fuso roda em UTC, e o app usa o relógio local para decidir o
  que é "hoje": das 21h à meia-noite, os agendamentos de amanhã apareceriam
  como atrasados. Se a equipe não estiver em São Paulo, mude ali.

## HTTPS

O painel (`gestor`) não publica porta nenhuma; quem atende a rede é o proxy
(`proxy`, Caddy), **só na porta 443**. Não há porta 80: `http://` não
responde, nem para redirecionar. `SESSION_SECURE=true` e `TRUST_PROXY=true`
vêm fixos do `docker-compose.yml` — não é preciso pôr no `server/.env`.

Se a máquina já usa a 443 (IIS, outro site), o `up` falha com "port is
already allocated". Mude o número da esquerda em `"443:443"`; o endereço
passa a ser `https://nome:PORTA`.

### Nome em vez de IP

`GESTOR_ENDERECO` no `web/.env` pode ser o IP do servidor
(`192.168.0.10`) ou um nome (`gestoratualizacao`). O nome precisa existir
na rede, e isso é fora do painel:

- **DNS da empresa** (roteador ou servidor de domínio): cadastre o nome
  apontando para o IP do servidor. Vale para todas as máquinas de uma vez.
  O servidor precisa de IP fixo (reserva no DHCP), senão o nome passa a
  apontar para o lugar errado.
- **Sem DNS:** em cada PC, como administrador, acrescente ao
  `C:\Windows\System32\drivers\etc\hosts` a linha
  `192.168.0.10  gestoratualizacao`.

Os dois ao mesmo tempo também valem, separados por vírgula
(`GESTOR_ENDERECO=gestoratualizacao, 192.168.0.10`) — útil enquanto o nome
ainda não chegou ao DNS ou ao `hosts` de todo mundo. **Para o acesso pelo IP
abrir, repita o IP em `GESTOR_IP`**: quando o endereço é um IP, o navegador
não informa ao servidor qual certificado quer, e sem essa dica o Caddy não
entrega nenhum. O certificado vale
**só** para o que estiver em `GESTOR_ENDERECO`: acessar por outro nome ou
IP dá aviso de certificado. Evite
nomes terminados em `.local` (o Windows os resolve por outro mecanismo, e o
nome falha às vezes). Nome sem ponto funciona, mas o Chrome trata
`gestoratualizacao` digitado sozinho como pesquisa: digite
`https://gestoratualizacao` ou crie um favorito.

### Certificado

O Caddy emite o certificado com uma **autoridade própria** (`tls internal`
em `proxy/Caddyfile`), criada na primeira subida e guardada no volume
`caddy-data`. Nenhuma autoridade pública assina nome interno nem IP, então
cada máquina da equipe precisa confiar nessa raiz uma vez:

```powershell
# No servidor, com os containers de pé:
docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt caddy-raiz.crt

# Em cada PC da equipe, num PowerShell como administrador. Caminho
# COMPLETO: o PowerShell de administrador abre em C:\Windows\system32, e
# só o nome do arquivo dá "O sistema não pode encontrar o arquivo".
certutil -addstore -f Root "C:\caminho\para\caddy-raiz.crt"
```

Chrome e Edge usam o repositório do Windows e param de avisar depois disso
(feche e abra o navegador). Se o Firefox ainda avisar, importe o mesmo
arquivo em Configurações → Privacidade e Segurança → Certificados. Celular
ou tablet: instale o `caddy-raiz.crt` pelo menu de segurança do aparelho.

A raiz vale 10 anos; o certificado do site é renovado sozinho pelo Caddy.
**Não apague o volume `caddy-data`**: perdê-lo gera uma raiz nova, e todas
as máquinas precisam instalá-la de novo.

### Endereço para os agentes

Em **Administração → Atualizador**, o "Endereço deste servidor para os
agentes" passa a ser `https://` + o `GESTOR_ENDERECO`. Os agentes C# que
apontavam para `http://IP:3000` param de alcançar o painel; ao reativar o
Atualizador, cada um precisa do endereço novo no `atualizador.ini` e da raiz
instalada na máquina do cliente.

## Limitações conhecidas

- Três perfis de acesso objetivos (Administrador, Operador e Consulta), atendendo
  às necessidades da equipe sem sobrecarga de matrizes complexas de permissão por tela.
- Sem sincronização em tempo real via WebSockets: se duas pessoas estiverem com o app
  aberto ao mesmo tempo, cada uma vê os dados atualizados ao trocar de aba ou atualizar
  a consulta (o app busca do servidor nesse momento), com proteção contra edição
  concorrente em pontos críticos como versões oficiais.
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

**Escopo das melhorias:** o Atualizador Automático está pausado. Pedidos
gerais de análise, planejamento e melhorias deste sistema consideram apenas
o painel de gestão. Não incluir propostas para agentes, distribuição, pacotes
ou publicação, salvo pedido explícito de retomada ou análise desse módulo.
O plano vigente está em [MELHORIAS.md](docs/MELHORIAS.md#plano-vigente).

| Documento | Para quem, e quando |
|---|---|
| Este README | Quem vai **usar** ou **instalar** o painel |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Quem vai **alterar o código**: como rodar, onde colocar cada coisa, o que não quebrar |
| [`SECURITY.md`](SECURITY.md) | O que protege o quê, onde ficam os segredos, e os limites assumidos de propósito |
| [`CHANGELOG.md`](CHANGELOG.md) | "Por que isso é assim?" — diário de decisões, em ordem cronológica |
| [`docs/OPERACAO.md`](docs/OPERACAO.md) | **Deu problema agora.** Runbook por sintoma: servidor fora do ar, ninguém entra, agente parado, restaurar backup |
| [`docs/MELHORIAS.md`](docs/MELHORIAS.md) | Plano vigente de melhorias e registro histórico das propostas anteriores |
| [`docs/DOCUMENTACAO_CONSOLIDADA.md`](docs/DOCUMENTACAO_CONSOLIDADA.md) | Arquitetura, decisões incorporadas, visão do projeto e plano de revisão concluído |

A documentação do agente C# fica no repositório dele — em especial
[`RISCOS-CONHECIDOS.md`](../atualizador/RISCOS-CONHECIDOS.md), que é leitura
obrigatória antes de mexer naquele lado.

### Qual documento responde o quê

- *"Como eu rodo isso?"* → este README.
- *"Onde eu ponho este arquivo novo?"* → `CONTRIBUTING.md`.
- *"Por que não usaram React?"* → [decisão 0001](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0001).
- *"Por que existe uma classe de sessão escrita à mão?"* → [decisão 0003](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0003).
- *"Quando isso mudou, e por quê?"* → `CHANGELOG.md`.
- *"Isso aqui é seguro?"* → `SECURITY.md`.
- *"Está fora do ar, e agora?"* → `docs/OPERACAO.md`.

## Licença

Proprietária — ver [LICENSE](LICENSE). O código está publicado para leitura;
usar, copiar, modificar ou incorporar em outro projeto exige autorização por
escrito.
