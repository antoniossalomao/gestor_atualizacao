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
| Senhas com `bcrypt` (teto de 128 chars e tempo constante no login) | `services/AuthService.js` | nunca se guarda senha legível e impede enumeração de usuários por timing |
| Sessão em SQLite com faxina periódica, cookie `httpOnly` + `sameSite=strict` | `database/ArmazemDeSessaoSqlite.js`, `Servidor.js`, `controllers/AuthController.js` | JS da página não lê o cookie; reduz CSRF e limpa sessões expiradas |
| Token CSRF por sessão + `Sec-Fetch-Site` em toda escrita da API | `middlewares/protecaoCsrf.js`, `client/js/api/ApiPainel.js` | outra página aberta no navegador não altera nada em nome de quem está logado, nem por formulário multipart |
| Limite de tentativas por IP+usuário, por IP e global por conta | `middlewares/LimitadorDeLogin.js`, `routes/index.js` | barra força bruta e password spraying no login, setup e troca de senha |
| Papéis (RBAC) por subárvore/rota (acessos, backups e histórico restritos) | `middlewares/exigirPapel.js`, `routes/index.js` | `consulta` não lê acessos remotos; só `admin` lê backups e trilha de auditoria |
| `Cache-Control: no-store` na API e CSP sem `script-src unsafe-inline` | `routes/index.js`, `Servidor.js` | evita gravação de respostas sensíveis em cache e reduz impacto de XSS |
| `ORDER BY` só a partir de lista fixa | `database/ordenacao.js` | injeção de SQL via `?sortBy=` |
| Escape de HTML automático com tag `html` | `client/js/utils/html.js` | XSS armazenado vindo de campo de texto |
| Somente HTTPS na rede + bind restrito em `127.0.0.1` (`HOST=127.0.0.1`) | `proxy/Caddyfile`, `config/transporte.js`, `middlewares/exigirHttps.js`, `Servidor.js` | senha e cookie nunca trafegam em texto puro e o Node só aceita o proxy local (`loopback`) |
| Cookie `Secure` + HSTS com HTTPS ligado | `Servidor.js` | o navegador não manda a sessão nem volta a tentar `http://` |
| Token compartilhado forte para agentes + rate limit | `middlewares/exigirAgente.js`, `routes/index.js` | recusa valor público de exemplo e limita rajadas em `/api/update/*` |
| Auditoria de alterações de acessos e downloads de backup | `services/ClienteService.js`, `services/BackupService.js` | registra diff `{ antes, depois }` de acessos e quem baixou o banco |
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

## Limites conhecidos (e cuidados na nuvem / Azure)

Mesmo com o sistema endurecido na aplicação, hospedar na **Azure** (exposição fora da rede local) exige cuidados de infraestrutura:

- **Azure App Service (Instância Web) — proxy da Azure, instância única e persistência:**
  - O balanceador da Azure termina o TLS e envia `X-Forwarded-For: IP:porta` (e `X-ARR-SSL` no Windows); o servidor normaliza ambos quando `TRUST_PROXY=true`.
  - Mantenha **`HOST` vazio** no App Service (o roteador da Azure conecta fora do loopback), ative **HTTPS Only**, **TLS >= 1.2**, desative **FTP/FTPS** e restrinja acesso por IP em **Networking → Access Restrictions** (ou **Microsoft Entra ID / EasyAuth** na frente do app).
  - Mantenha **`Scale Out = 1`** (nunca 2+ instâncias com SQLite) e `DB_PATH` fora de `wwwroot` (ex.: `/home/data/gestao.db` no Linux ou `D:\home\data\gestao.db` no Windows).
- **VM Azure com Caddy — certificado e isolamento da porta 3000.**
  Em rede privada ou VPN, o Caddy assina com raiz própria (`tls internal`); em VM com domínio público DNS, use Let's Encrypt. Com o Caddy na mesma VM, defina `HOST=127.0.0.1` no `server/.env` e **bloqueie a porta 3000 no Network Security Group (NSG)**, liberando apenas a porta 443.
- **Login e configuração inicial não exigem o token CSRF** (não há sessão
  antes deles). Outra página não consegue enviá-los porque só aceitam JSON,
  que o navegador não manda para outra origem sem autorização (CORS), que o
  servidor não dá. Habilitar CORS no servidor abre esse caminho.
- **Auditoria de leitura:** o `HistoricoService` registra alterações (incluindo diff de acessos remotos) e downloads de backup (`baixar_backup`), mas não registra quem *visualizou* um cadastro de cliente/acesso sem editar.
- **Backups do banco ficam em disco sem criptografia própria da aplicação**, em `server/data/backups/` (ou no diretório definido por `DB_PATH`). Na Azure, habilite backup gerenciado (App Service Backup ou Azure Backup da VM) em cofre protegido por RBAC/MFA.

## Dependências

`npm audit` no diretório `server/` antes de publicar uma mudança que mexa em
`package.json` (o CI também roda, só sobre o que vai para a produção). O
histórico de endurecimento e as decisões sobre dependências estão no
[README](README.md#segurança-das-dependências) — inclusive por que o
armazenamento de sessão é uma classe própria em vez de um pacote pronto.
