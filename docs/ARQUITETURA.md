# Arquitetura, Desenvolvimento e Segurança

Este documento consolida o guia de contribuição, a arquitetura de código, os controles de segurança e os registros de decisão (ADRs) do painel web.

---

## 1. Como trabalhar no código

### Ambiente e verificações obrigatórias

O repositório exige apenas **Node.js `>= 20.6.0`** (CI e produção usam `22`) e **não possui bundler nem dependências de front-end**.

```powershell
npm run check     # verificação estática via tsc --noEmit nos módulos puros
npm test          # suíte completa (servidor + cliente, sem mock de banco)
```

Os testes do servidor sobem instâncias reais de `BancoDeDados` e `Server` em diretórios temporários com SQLite descartável. Dois detalhes importantes das APIs de repositório:
- `repositorio.list()` retorna `{ rows, total, page, pageSize }` (não `items`) e não ordena por `id`;
- `list()` não inclui `criado_em`/`concluido_em` — apenas `find(id)` retorna essas colunas.

**Inspeção no navegador:** o repositório não mantém suíte automatizada de navegador ([ADR-0012](#adr-0012)). Qualquer alteração em tela, componente ou CSS deve ser validada visualmente nos dois temas (claro e escuro).

### Onde colocar cada arquivo

**Servidor (`server/src/`):** fluxo estrito em camadas de cima para baixo:

```text
routes/ -> controllers/ -> services/ -> database/
```

| Pasta | Responsabilidade | Proibido conter |
|---|---|---|
| `routes/` | Mapear URLs, rate limits e papéis (`exigirLogin`/`exigirPapel`) | Lógica de negócio |
| `controllers/` | Ler `req`, chamar serviço e montar `res` | SQL e regra de negócio |
| `services/` | Regras de negócio, validações e orquestração | `req`/`res` e SQL |
| `database/` | Um repositório por tabela; único ponto com SQL e statements cacheados | Regra de negócio |
| `middlewares/` | Autenticação, RBAC, CSRF, limites, erros e 404 explícito | Regra de negócio |
| `shared/` | Código reutilizado por duas ou mais camadas | Dependência de camada |
| `config/` | Constantes, transporte e schema padrão de regras da equipe | Lógica de I/O |

**Front-end (`client/js/`):** divisão por dependência de DOM (`utils → domain → templates → components → views`, com `app/` e `api/` na orquestração):

- **`utils/`**, **`domain/`** e **`templates/`** **não podem tocar no DOM** (`document`/`window`/`localStorage`). Isso é garantido por [`client/tsconfig.json`](../client/tsconfig.json) (`lib` sem `dom`) e pelos testes estáticos do cliente.
- **`components/`** contém peças de UI reutilizáveis que não conhecem telas específicas.
- **`views/`** orquestra cada tela ligando domínio, templates, componentes e `ApiPainel`.
- **`api/ApiPainel.js`** é o único módulo que executa `fetch` (centraliza token CSRF, sessão e erros de rede).

### Estilo, vocabulário e commits

- Escreva nomes de domínio, UI e comentários em **português**; inglês apenas onde a linguagem impõe.
- Nunca utilize o termo legado proibido no vocabulário do projeto (sempre use **"atualização"** / **"última atualização"**) — ver [`client/tests/vocabulario.test.mjs`](../client/tests/vocabulario.test.mjs).
- Classes em `PascalCase.js`; módulos de função solta em `camelCase.js`.
- Comentários explicam **por quê** (armadilhas reais, motivos de segurança ou negócio), nunca **o quê**.
- Mensagens de commit no modo imperativo com escopo quando útil (ex.: `feat(saude): ...`, `fix(ui): ...`).

---

## 2. Segurança e controles em vigor

Este é um sistema interno corporativo que armazena dados cadastrais e **IDs de acesso remoto** dos clientes. Problemas de segurança não devem virar issue pública; trate diretamente com o responsável pelo repositório e rotacione segredos antes de qualquer investigação se houver suspeita de exposição.

### Controles implementados

| Controle | Implementação | Objetivo |
|---|---|---|
| Hash e tempo constante | `server/src/services/AuthService.js` | `bcrypt` com limite de 128 caracteres e comparação mesmo para usuário inexistente (evita enumeração por timing) |
| Sessões em SQLite | `server/src/database/ArmazemDeSessaoSqlite.js` | Cookies `httpOnly` + `sameSite=strict` em arquivo isolado (`sessions.sqlite`), com limpeza periódica a cada 1h |
| Proteção CSRF | `server/src/middlewares/protecaoCsrf.js`, `ApiPainel.js` | Token aleatório por sessão no cabeçalho `X-CSRF-Token` exigido em todo POST/PUT/PATCH/DELETE de `/api` (antes do `multer`) |
| Rate limiting | `server/src/middlewares/LimitadorDeLogin.js`, `routes/index.js` | Bloqueio por IP+usuário, por IP, global por conta no login/senha e limitadores dedicados em backups e `/api/update/*` |
| RBAC por rota | `server/src/middlewares/exigirPapel.js`, `routes/index.js` | Restringe acessos remotos a `operador`/`admin` e backups/auditoria/administração a `admin` |
| Cabeçalhos e CSP | `server/src/Servidor.js` | `helmet`, `Cache-Control: no-store` na API e CSP sem `script-src 'unsafe-inline'` (tema inicial extraído para `temaInicial.js`) |
| SQL seguro | `server/src/database/ordenacao.js`, `BaseRepository.js` | Queries parametrizadas com statements cacheados (`_preparado`) e whitelist explícita para `ORDER BY` |
| Escape HTML | `client/js/utils/html.js` | Tag `html` escapa toda interpolação por padrão, impedindo XSS armazenado |
| HTTPS e Proxy | `config/transporte.js`, `middlewares/exigirHttps.js` | Recusa HTTP em produção (`403`), valida `SESSION_SECURE`/`TRUST_PROXY` no boot e normaliza `X-Forwarded-For`/`X-ARR-SSL` |
| Auditoria e erros | `ClienteService.js`, `BackupService.js`, `rotaNaoEncontrada.js` | Diff `{ antes, depois }` em acessos remotos, registro de downloads de backup e 404 explícito fora do SPA |

### Segredos e limites assumidos

- **`server/.env` nunca entra no Git** (`.gitignore` bloqueia `.env` e `.env.*`, liberando apenas `.env.example`).
- **`SESSION_SECRET`:** o servidor recusa iniciar vazio ou com o valor público de exemplo. Trocar invalida todas as sessões abertas.
- **`AGENT_API_TOKEN`:** compartilhado com todos os agentes C# instalados; o servidor recusa o valor de exemplo e compara tokens em tempo constante.
- **Limites conhecidos:**
  - *Login e setup inicial* não carregam token CSRF prévio; dependem de aceitarem apenas `application/json` e da ausência de CORS permissivo no servidor.
  - *Auditoria* grava mutações e downloads do banco, não visualizações de leitura.
  - *Backups em disco* (`server/data/backups/`) não possuem criptografia própria da aplicação — proteja o disco/cofre do host ou VM (BitLocker/SSE/Azure Backup).
  - *SQLite único:* exige instância única (`Scale Out = 1` no App Service) e disco local com suporte a travas POSIX/Windows (evite compartilhamentos SMB/NFS para WAL).

### Auditoria de dependências

Execute `npm audit --omit=dev` dentro de `server/` antes de atualizar bibliotecas (o CI também audita em cada push/PR e semanalmente via cron). A classe própria `ArmazemDeSessaoSqlite` existe deliberadamente para não depender de `connect-sqlite3` (que puxava `sqlite3` / `node-gyp`). A única vulnerabilidade transitiva histórica restante em `server/` decorre de `uuid` dentro de `exceljs` (sem alternativa de major compatível no pacote).

---

## 3. Decisões de Arquitetura (ADRs)

<a id="adr-0001"></a>
### ADR-0001 — Front-end sem framework e sem etapa de build
- **Decisão:** HTML, CSS e JavaScript ES Modules nativos em `client/`, servidos diretamente sem bundler, transpilador ou `node_modules` de front-end.
- **Por quê:** equipe enxuta precisa abrir o arquivo real no servidor ou navegador e depurar sem sourcemaps ou quebra de toolchain após anos sem build. Compensado por testes de módulo em Node e JSDoc checado estaticamente ([ADR-0006](#adr-0006)).

<a id="adr-0002"></a>
### ADR-0002 — SQLite embarcado com driver síncrono (`better-sqlite3`)
- **Decisão:** SQLite em modo `WAL` com driver síncrono `better-sqlite3` e schema gerenciado em código.
- **Por quê:** compatibilidade direta com o `gestao.db` legado (Python/Tkinter), zero servidor de banco externo, binários pré-compilados no Windows e leitura/gravação linear que evita condições de corrida em sessões e transações. Aceita trava do event loop em consultas raras pesadas (controladas por limites em [`limitesPlanilha.js`](../server/src/config/limitesPlanilha.js)).

<a id="adr-0003"></a>
### ADR-0003 — Armazenamento de sessão escrito à mão
- **Decisão:** estender `express-session.Store` em [`ArmazemDeSessaoSqlite.js`](../server/src/database/ArmazemDeSessaoSqlite.js) usando um banco separado `sessions.sqlite`.
- **Por quê:** evita `connect-sqlite3`/`node-gyp`, persiste login de forma síncrona antes de responder, permite `clearAll()` ao restaurar backup e separa sessões dos dados principais (`gestao.db`).

<a id="adr-0004"></a>
### ADR-0004 — Injeção de dependência manual em `Servidor.js`
- **Decisão:** nenhuma biblioteca de DI e nenhum singleton auto-importado; `Servidor.js` instancia serviços e controllers em ordem explícita via construtor.
- **Por quê:** torna o grafo completo legível em um único arquivo e facilita subir servidores e bancos temporários isolados em testes.

<a id="adr-0005"></a>
### ADR-0005 — `client/js/` separado por responsabilidade e acesso ao DOM
- **Decisão:** dividir o cliente em `utils/`, `domain/`, `templates/`, `components/`, `views/` e `app/`, mantendo as três primeiras camadas totalmente livres de DOM.
- **Por quê:** torna toda regra de negócio e marcação HTML testável diretamente em Node, sem precisar de navegador ou mocks complexos de DOM.

<a id="adr-0006"></a>
### ADR-0006 — Verificação estática de tipos sem build (`tsc --noEmit`)
- **Decisão:** rodar TypeScript com `checkJs: true` e `noEmit: true` apenas no núcleo puro ([`client/tsconfig.json`](../client/tsconfig.json) e [`server/tsconfig.json`](../server/tsconfig.json)), sem `@types/node` e sem `dom`.
- **Por quê:** transforma JSDoc em portão real sem gerar ~500 falsos positivos em código de manipulação direta de DOM ou propriedades dinâmicas de banco.

<a id="adr-0007"></a>
### ADR-0007 — Tabelas de ligação normalizadas e migrações numeradas
- **Decisão:** substituir strings separadas por vírgula e JSONs de sistemas por tabelas relacionais (`atualizacao_sistemas`, `cliente_sistemas`) via migrações numeradas e transacionais controladas por `PRAGMA user_version` em [`migracoes.js`](../server/src/database/migracoes.js), sempre precedidas de backup verificado.
- **Por quê:** elimina divergências de grafia (`B_NFE` vs `B_NFe`) e fragilidade ao renomear clientes, mantendo compatibilidade de resposta nas visões SQL `atualizacoes_v` e `clientes_v`.

<a id="adr-0008"></a>
### ADR-0008 — Regra única da situação do cliente
- **Decisão (revisada em 29/09/2026):** [`situacaoVersao.js`](../server/src/services/situacaoVersao.js) centraliza a regra no servidor usando **a data da última atualização contra a data da versão oficial** (ignorando texto livre de versão recebida para classificação). Clientes com `B_Vendas` são julgados por ele no indicador geral; sistemas fixos (`controla_versao = 0`) não entram na conta.
- **Por quê:** padroniza Resumo, Sistemas e Ficha do Cliente numa única fonte de verdade.

<a id="adr-0009"></a>
### ADR-0009 — Campanhas: meta guardada, andamento calculado ao vivo
- **Decisão:** guardar apenas a meta (`campanhas`) e eventuais clientes selecionados (`campanha_clientes` + coluna `so_selecionados`), calculando atualizados/agendados/pendentes ao vivo a partir do histórico; encerrar congela o placar (`total_final`, `atendidos_final`).
- **Por quê:** registrar uma atualização em *Atualizações* já dá baixa automática sem duplicar controle nem precisar de baixa manual.

<a id="adr-0010"></a>
### ADR-0010 — Somente HTTPS na rede atrás de proxy reverso
- **Decisão:** em desenvolvimento local sem `SESSION_SECURE`, o Node escuta apenas em `127.0.0.1` HTTP; em produção na rede, atende sempre atrás de proxy HTTPS (Caddy nativo em [`proxy/Caddyfile`](../proxy/Caddyfile) com `HOST=127.0.0.1`, ou terminação TLS gerenciada no Azure App Service com `HOST` vazio), exigindo `SESSION_SECURE=true` e `TRUST_PROXY=true` e recusando requisições não seguras (`403`) fora do healthcheck `/api/auth/status`.
- **Por quê:** impede login e cookies trafegando em texto puro na rede e recusa configurações inválidas logo no boot em vez de falhar silenciosamente no login. *(Originalmente implantado com Docker/Caddy; desde out/2026 padronizado em Windows/NSSM+Caddy nativo ou Azure).*

<a id="adr-0011"></a>
### ADR-0011 — Proteção CSRF por token aleatório na sessão
- **Decisão:** emitir token por sessão no cabeçalho `X-CSRF-Token` em respostas autenticadas e exigi-lo antes das rotas e do `multer` em qualquer escrita sob `/api` (além da checagem de `Sec-Fetch-Site`).
- **Por quê:** protege inclusive envios multipart/form-data que escapariam de validação simples por `Content-Type: application/json`, sem quebrar múltiplas abas abertas.

<a id="adr-0012"></a>
### ADR-0012 — Testes de navegador via CDP *(Revogada)*
- **Decisão e revogação:** criada e removida em 29/09/2026 para manter a suíte automatizada leve, rápida e sem dependência de binário de navegador no CI. A validação visual de fluxos de UI é feita diretamente no navegador antes de entregar mudanças de interface.

<a id="adr-0013"></a>
### ADR-0013 — Prazo configurável após versão oficial e dependentes do `B_Vendas`
- **Decisão:** uma versão oficial recém-lançada coloca sistemas atrasados há menos de `prazoVersaoDias` (padrão 60 dias) em *Aguardando atualização*; sistemas nunca atualizados ou com atraso anterior ao prazo contam como *Desatualizado*. Sistemas dependentes (`sistemas.atualiza_com_principal`, ex.: NFCe e Consignado M2) herdam a data da última atualização do `B_Vendas` do cliente.
- **Por quê:** evita falsos alertas vermelhos imediatos no dia do lançamento de uma versão e reflete a prática real de implantação conjunta.

<a id="adr-0014"></a>
### ADR-0014 — Vocabulário único no projeto
- **Decisão:** padronizar exclusivamente os termos **"atualização"** e **"última atualização"** em UI, rotas/parâmetros internos, comentários e documentação, fiscalizados continuamente por `client/tests/vocabulario.test.mjs`.
