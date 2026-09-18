# Segurança

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
| Sessão em SQLite, cookie `httpOnly` + `sameSite=lax` | `database/SqliteSessionStore.js`, `Server.js` | JS da página não lê o cookie; reduz CSRF |
| Limite de tentativas de login | `middlewares/LoginRateLimiter.js` | força bruta contra senha fraca |
| Papéis (RBAC) por subárvore de rota | `middlewares/requireRole.js`, `routes/index.js` | padrão fechado: rota nova nasce protegida |
| CSP sem `script-src unsafe-inline` | `Server.js` | reduz o estrago de um XSS |
| `ORDER BY` só a partir de lista fixa | `shared/sortHelper.js` | injeção de SQL via `?sortBy=` |
| Escape de HTML na montagem de tela | `client/js/utils/html.js` | XSS armazenado vindo de campo de texto |
| Token compartilhado para os agentes C# | `middlewares/requireAgent.js` | as rotas do agente não usam sessão de navegador |
| 404 explícito em vez de fallback de SPA | `middlewares/notFoundHandler.js` | rota de API errada devolvia HTML e escondia o erro |

## Segredos

- `server/.env` **nunca** vai para o git. O `.gitignore` cobre `.env` e
  `.env.*` (exceto `.env.example`) — a regra ampla existe porque um `.env.bak`
  feito à mão já foi commitado uma vez.
- `SESSION_SECRET` precisa ser longo e aleatório em produção. Trocá-lo desloga
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

- **Roda em HTTP puro na rede local.** Sessão e senha trafegam sem TLS. Quem
  estiver na mesma rede e souber capturar tráfego vê tudo. Exposto à internet,
  exige proxy reverso com HTTPS e `SESSION_SECURE=true`.
- **Não há proteção de CSRF por token.** A defesa hoje é `sameSite=lax` no
  cookie, que cobre o caso comum (formulário postado de outro site), mas não é
  equivalente a um token por requisição.
- **Não há auditoria de leitura.** O `HistoricoService` registra quem *alterou*
  o quê; não registra quem *consultou* — inclusive quem abriu a tela de Acessos.
- **Backups do banco ficam em disco, sem criptografia**, em `server/data/backups/`.
  Quem tem acesso ao sistema de arquivos do servidor tem os dados.

## Dependências

`npm audit` no diretório `server/` antes de publicar uma mudança que mexa em
`package.json`. O histórico de endurecimento e as decisões sobre dependências
estão no [CHANGELOG](CHANGELOG.md) — inclusive por que o armazenamento de
sessão é uma classe própria em vez de um pacote pronto.
