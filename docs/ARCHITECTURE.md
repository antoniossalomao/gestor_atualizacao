# Arquitetura

Este documento explica como o código está organizado e por quê — útil
para quem for mexer no projeto depois. Para "o que o app faz", veja o
[README.md](../README.md); para "onde cada parte do app Python original
foi parar aqui", veja a tabela de equivalência no mesmo README.

## Visão geral

```
navegador (client/)  <--HTTP/JSON-->  Express (server/)  <-->  SQLite (gestao.db)
```

Um único processo Node serve tudo: os arquivos estáticos do front-end
(`client/`) e a API JSON (`/api/...`). Não existe build step, bundler
nem transpilação — tanto o backend quanto o front-end rodam o
JavaScript exatamente como está escrito nos arquivos.

## Backend (`server/`)

Camadas, de fora para dentro:

```
rotas (routes/)  ->  controllers/  ->  services/  ->  database/ (repositórios)  ->  SQLite
```

- **`database/`** — uma classe `Database` (abre a conexão, roda as
  migrações, é dona do backup automático) e um `Repository` por tabela
  (`ClienteRepository`, `AtualizacaoRepository`, etc.). **Só aqui existe
  SQL.** Nenhuma outra camada monta uma query diretamente — sempre
  chama um método do repositório certo. Isso é uma continuação direta
  da mesma regra que já existia em `gestor/database.py` no app Python.

- **`services/`** — as regras de negócio: campo obrigatório, formato de
  data, nome de cliente único, propagação de rename, cálculo dos
  indicadores do Resumo, import/export de planilha, login. No app
  Python original essas regras ficavam misturadas dentro de cada
  `View` do Tkinter (validação e desenho de tela juntos); aqui viraram
  classes próprias — o que também permite testar essa lógica sem
  precisar simular uma requisição HTTP inteira.

- **`controllers/`** — bem finos de propósito: recebem a requisição,
  chamam o método certo do serviço, devolvem a resposta. Nenhuma regra
  de negócio deveria vazar para cá.

- **`routes/index.js`** — só o mapeamento "verbo HTTP + caminho ->
  método do controller". Rotas de autenticação (`/api/auth/...`) não
  passam pelo middleware `requireAuth`; todo o resto passa.

- **`Server.js`** — a classe raiz: cria o `Database`, monta os serviços
  e controllers (injeção de dependência simples, na mão, sem framework
  de DI) e configura o Express (sessão, rotas, arquivos estáticos,
  tratamento de erro). `server.js` (na raiz de `server/`) só lê o
  `.env` e chama `new Server(config).start()`.

### Por que `better-sqlite3` (e não `sqlite3`/`node:sqlite`)

É **síncrono** — os métodos de repositório não usam `await`. Foge do
padrão mais comum em Node (tudo assíncrono), mas é a mesma filosofia de
código direto que o `sqlite3` do Python já usava no app original: o
SQLite lê do disco rápido o bastante para "esperar de forma
assíncrona" não trazer benefício nenhum aqui, só complexidade extra.

### Erros

`services/errors.js` define `ValidationError` (400) e `NotFoundError`
(404) — erros "esperados", com uma mensagem segura de mostrar direto
pro usuário. Um controller captura esses erros e chama `next(err)`;
`middlewares/errorHandler.js` decide o status HTTP e o formato da
resposta. Qualquer outro erro (bug, falha do banco) vira 500 genérico,
sem vazar detalhe interno pra quem está no navegador.

### Sessão de login

`database/SqliteSessionStore.js` é uma classe própria (estende
`session.Store` do `express-session`) que guarda as sessões num arquivo
`sessions.sqlite` separado, usando a mesma biblioteca `better-sqlite3`
já usada pelo resto do app. Existe um pacote pronto pra isso
(`connect-sqlite3`), mas ele depende de `sqlite3` + `node-gyp`, que no
momento em que este projeto foi criado tinha uma cadeia de dependências
com vulnerabilidades conhecidas — evitado de propósito.

## Front-end (`client/`)

JavaScript puro, sem framework, carregado como [ES
Modules](https://developer.mozilla.org/docs/Web/JavaScript/Guide/Modules)
direto pelo navegador (`<script type="module">`) — sem bundler.

```
core/App.js  -- classe raiz: decide tela de login vs. shell principal,
                troca de aba, mantém uma instância de cada View viva
core/View.js -- classe base de toda tela: listeners rastreados (removidos
                no destroy()) e o ciclo stale-while-revalidate de dados
views/*.js   -- uma classe por tela (Resumo, Atualizações, Agendamentos,
                Clientes, Consultar Cliente, Distribuição, Versões,
                Sistemas, Histórico, Login), cada uma dona do seu
                próprio pedaço de DOM
core/*.js    -- peças reaproveitadas por várias views: SortableTable
                (tabela ordenável), Pagination, Autocomplete, Modal,
                Toast, PieChart/BarChart, CommandPalette (Ctrl+K),
                EmptyState, SwrCache, router, theme, prefs, debounce
api/ApiClient.js -- único lugar que chama `fetch`; todo o resto fala com
                     o servidor através dele
```

Cada `View` é instanciada uma única vez (não é recriada ao trocar de
aba) para não perder o que o usuário estava digitando ao só dar uma
olhada em outra tela. Toda vez que a aba dela fica visível, `App.js`
chama `view.refresh()`, que busca os dados mais recentes do servidor —
importante porque agora, com vários usuários, os dados podem ter mudado
enquanto você estava em outra aba (no app desktop original, uso
individual, isso não existia).

Esse `refresh()` usa **stale-while-revalidate** (`core/SwrCache.js`): o
que já foi buscado aparece na hora, a revalidação roda em segundo plano,
e a tela só é redesenhada se a resposta for diferente. Uma escrita numa
aba invalida o cache das outras que dependem do mesmo dado — cadastrar
um cliente, por exemplo, derruba o cache de `resumo` e `consulta`.

O estado da navegação vive na URL (`#/clientes`, via `core/router.js`):
recarregar a página mantém a tela aberta e dá para compartilhar o link
de uma aba específica.

### Herdar de `View`

Toda tela nova deve estender `core/View.js` e usar `this.on(alvo, evento,
fn)` em vez de `addEventListener` direto quando o alvo for `document` ou
`window`. Listeners registrados assim são removidos no `destroy()` — sem
isso eles sobrevivem à instância (o que já causou uma tela fantasma
reagindo à tecla `Delete` depois de um novo login).

### Por que sem framework

Decisão do usuário do projeto: manter o front-end em JavaScript puro,
orientado a objetos, sem etapa de build. Cada `View` segue o mesmo
papel que sua equivalente tinha em `gestor/views/*.py` no app Tkinter
original — só que desenhando HTML/CSS em vez de widgets Tkinter.

## Mapa completo: onde cada parte do app Python foi parar

Ver a tabela "Onde cada parte do app original foi parar" no
[README.md](../README.md) deste projeto.

## Revisão de interface e distribuição (set/2026)

Uma revisão ampla do front-end e do módulo de distribuição está
documentada em [REVISAO_INTERFACE.md](REVISAO_INTERFACE.md): defeitos
corrigidos, o modelo de "uma versão no ar por sistema", o painel de
acompanhamento dos agentes, cache, rotas, tema claro e acessibilidade.

**Se você for mexer no agente (Worker C#), leia a seção "Contrato do
agente" desse documento**: `GET /api/update/check/:cnpj` passou a exigir
o parâmetro `?sistema=`, porque antes ele respondia com a última versão
publicada de *qualquer* sistema — o agente do B_NFe podia acabar
instalando o pacote do B_Vendas.
