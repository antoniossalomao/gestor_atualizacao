# Segurança

As decisões de segurança do painel estão registradas como ADRs na
[documentação consolidada](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0010) (HTTPS no
ADR-0010, proteção CSRF no [ADR-0011](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0011)).
Para pedidos gerais, vale o [escopo documentado no README](README.md#escopo-das-melhorias).

Este é um sistema **interno**: roda na rede da empresa, atende uma equipe
pequena e guarda dados de clientes (nomes, cidades, sistemas instalados e
**IDs de acesso remoto**). Não é um produto público, mas o conteúdo é
sensível — o cadastro de acessos, sozinho, é um mapa de como entrar na
máquina de cada cliente.

## Como relatar um problema

Problemas de segurança **não** devem virar issue pública. Fale direto com o
responsável pelo repositório. Se achou credencial exposta em algum arquivo,
trate como incidente: rotacione primeiro, avise depois.

## O que já está no lugar

| Proteção | Onde | Por quê |
|---|---|---|
| Senhas com `bcrypt` | `services/AuthService.js` | nunca se guarda senha legível |
| Sessão em SQLite, cookie `httpOnly` + `sameSite=lax` | `database/ArmazemDeSessaoSqlite.js`, `Server.js` | JS da página não lê o cookie; reduz CSRF |
| Token CSRF por sessão em toda escrita da API | `middlewares/protecaoCsrf.js`, `client/js/api/ApiClient.js` | outra página aberta no navegador não altera nada em nome de quem está logado, nem por formulário multipart |
| Limite de tentativas de login | `middlewares/LimitadorDeLogin.js` | força bruta contra senha fraca |
| Papéis (RBAC) por subárvore de rota | `middlewares/exigirPapel.js`, `routes/index.js` | padrão fechado: rota nova nasce protegida |
| CSP sem `script-src unsafe-inline` | `Server.js` | reduz o estrago de um XSS |
| `ORDER BY` só a partir de lista fixa | `database/ordenacao.js` | injeção de SQL via `?sortBy=` |
| Escape de HTML na montagem de tela | `client/js/utils/html.js` | XSS armazenado vindo de campo de texto |
| Somente HTTPS na rede | `docker-compose.yml`, `proxy/Caddyfile`, `config/transporte.js`, `middlewares/exigirHttps.js` | senha e cookie nunca trafegam em texto puro; HTTP puro só escuta em `127.0.0.1` |
| Cookie `Secure` + HSTS com HTTPS ligado | `Server.js` | o navegador não manda a sessão nem volta a tentar `http://` |
| Token compartilhado para os agentes C# | `middlewares/exigirAgente.js` | as rotas do agente não usam sessão de navegador |
| 404 explícito em vez de fallback de SPA | `middlewares/rotaNaoEncontrada.js` | rota de API errada devolvia HTML e escondia o erro |

## Segredos

- `server/.env` **nunca** vai para o git. O `.gitignore` cobre `.env` e
  `.env.*` (exceto `.env.example`) — a regra ampla existe porque um `.env.bak`
  feito à mão já foi commitado uma vez.
- `SESSION_SECRET` precisa ser longo e aleatório. O servidor se recusa a subir
  sem ele ou com o valor de exemplo do `.env.example`. Trocá-lo desloga
  todo mundo, e é a ação certa se houver suspeita de vazamento:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `AGENT_API_TOKEN` é compartilhado com cada agente C# instalado em cliente.
  Trocar aqui exige trocar o `API_TOKEN` no `atualizador.ini` de **todos** os
  agentes — senão eles param de conseguir atualizar, em silêncio, do ponto de
  vista de quem olha o painel.

## Limites conhecidos (e assumidos)

Isto não é uma lista de pendências: são escolhas conscientes, dado o contexto
de rede interna. Se o sistema for exposto à internet, **todas** precisam ser
revistas:

- **Certificado de autoridade própria.** O Caddy assina com uma raiz gerada
  na instalação (`tls internal`), que cada máquina da equipe instala. Quem
  tiver a chave da raiz (volume `caddy-data`) consegue emitir certificado
  aceito por essas máquinas. Na internet, com domínio público, troque por
  certificado público (ver `proxy/Caddyfile`).
- **A proteção contra `X-Forwarded-Proto` forjado é a rede, não o código.**
  `TRUST_PROXY=true` confia em quem conectar direto no Node; é seguro porque
  o `docker-compose.yml` não publica a porta dele. Publicá-la de volta abre
  o furo.
- **Login e configuração inicial não exigem o token CSRF** (não há sessão
  antes deles). Outra página não consegue enviá-los porque só aceitam JSON,
  que o navegador não manda para outra origem sem autorização (CORS), que o
  servidor não dá. Habilitar CORS no servidor abre esse caminho.
- **Não há auditoria de leitura.** O `HistoricoService` registra quem *alterou*
  o quê; não registra quem *consultou* — inclusive quem abriu a tela de Acessos.
- **Backups do banco ficam em disco, sem criptografia**, em `server/data/backups/`.
  Quem tem acesso ao sistema de arquivos do servidor tem os dados.

## Dependências

`npm audit` no diretório `server/` antes de publicar uma mudança que mexa em
`package.json` (o CI também roda, só sobre o que vai para a produção). O
histórico de endurecimento e as decisões sobre dependências estão no
[README](README.md#segurança-das-dependências) — inclusive por que o
armazenamento de sessão é uma classe própria em vez de um pacote pronto.
