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
  e [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para como o código está
  organizado.

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
| `DISCORD_WEBHOOK_URL` | Opcional. Quando configurada, avisa um canal do Discord a cada atualização nova cadastrada. |

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
