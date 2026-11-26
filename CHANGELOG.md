# Histórico de mudanças — painel web

Diário cronológico das mudanças e decisões relevantes do painel web. Não versiona releases numeradas ao público: registra **o que mudou e por quê**, preservando o contexto para manutenção futura (para detalhes diários de agosto e setembro/2026 anteriores à consolidação, consulte `git log`).

---

### Novembro de 2026

- **Atualização de *Sobre e ajuda* e script de deploy Windows (19/11/2026):**
  - Atualizada a aba *Configurações › Sobre e ajuda* (`client/js/domain/ajuda.js`) com as novidades de novembro (Diagnóstico detalhado, zoom padrão de 90%, busca sem acento e melhorias de segurança) e descrições revisadas de *Sistemas* e *Administração*.
  - Adicionado `scripts/deploy-windows.ps1` para execução direta de dentro da pasta do servidor sem parâmetros: fecha `GestorApp`, baixa o código novo do GitHub em `%TEMP%` (ou usa `-Origem`), atualiza somente o código sem mexer em `server/.env`, `proxy/` nem `server/data/` (confere hashes SHA-256 antes e depois) e reabre o serviço validando saúde.

- **Limpeza do repositório, CI e consolidação da documentação (19/11/2026):**
  - Removidos restos obsoletos de Docker (`scripts/build-css.js`, `.env.example` da raiz e job `varredura-da-imagem` no `.github/workflows/ci.yml`), lockfile vazio em `client/package-lock.json`, relatórios antigos (`CLEANUP_REPORT.md`, `relatorio.md`, `PLANEJAMENTO_POLIMENTO_VISUAL.md`) e duplicações em `codeql.yml`.
  - Documentação consolidada em cinco documentos enxutos e sincronizados com o código atual: `README.md`, `docs/ARQUITETURA.md`, `docs/OPERACAO.md`, `CHANGELOG.md` e `CLAUDE.md`.

- **Redução global de 10% no zoom da interface (`--zoom-app: 0.9`) (19/11/2026):**
  - Aplicado `zoom: var(--zoom-app)` (`0.9`) no `:root` de `theme.css` (resetado para `1` em `@media print`), preservando o zoom nativo do navegador e a preferência *Tamanho da fonte* (`--escala`).
  - Compensadas as medidas baseadas em viewport (`--vh-cheia`, `--dvh-cheia`, `--vw-cheia` e `--altura-tabela`) em CSS e convertidas coordenadas visuais para pré-zoom via `fatorZoom()` (`elemento.js`) em `alturaDisponivel.js`, `CampoComSugestoes.js`, `botaoOcupado.js` e `TelaComAbas.js`.

- **Melhoria da tela Administração › Diagnóstico (19/11/2026):**
  - Grade responsiva em 2 colunas com container query (`@container saude`), remoção de seletores conflitantes no resumo saudável, pílulas de verificação rápida no topo e novas métricas reais em `/api/saude` (tempo da verificação, WAL, `sessions.sqlite`, versão de esquema, volume de registros, RSS, sessões ativas, modo de transporte e retenção/integridade de backups), além de botão *Fazer cópia agora*.

- **Adaptação para Azure App Service e endurecimento de segurança (17/11/2026):**
  - Suporte a cabeçalhos de balanceador (`X-Forwarded-For` com porta e `X-ARR-SSL`), named pipes em `PORT`, `DB_PATH` automático fora de `wwwroot` no App Service e `PRAGMA busy_timeout = 5000`.
  - `AuthService.login()` em tempo constante com limite de 128 chars em senhas; limite global por conta em `LimitadorDeLogin` e proteção para troca de senha e rotas `/api/update/*`; restrição RBAC em acessos remotos (`operador`/`admin`), backups/histórico (`admin`), `Cache-Control: no-store`, limpeza horária em `sessions.sqlite`, `HOST=127.0.0.1` atrás de Caddy local e migração de `AcessosModal.js`/`HistoricoView.js` para a tag segura `html`.

- **Guia Windows Nativo (NSSM + Caddy) (16/11/2026):**
  - Documentação completa para produção em servidores/VMs Windows sem Docker (`GestorApp` + `GestorProxy` gerenciados via NSSM).

- **Frequência em 60 dias, filtros na gaveta, navegação vertical e acabamento visual (13–16/11/2026):**
  - Card de frequência no Resumo atualizado para **60 dias** com sistemas mais pendentes, filtro nas gavetas, validação imediata em Integrações, salvamento por bloco em Operação, edição inline em Sistemas e atalhos na Ficha 360° e notificações (PR #34).
  - Menu vertical com busca rápida e índice *Nesta página* em *Administração* e *Configurações*, paleta padrão calibrada para Off-white/Creme matte com barra lateral escura fixa, KPIs clicáveis no Resumo, Kanban sem emojis e gráficos SVG refinados (`GraficoDeLinhas` e `GraficoDeBarras`).

---

### Outubro de 2026

- **Edição manual de versão por sistema em Atualizações (26/10/2026):**
  - Formulário permite informar ou editar versão manualmente por sistema (ou manter preenchimento pela versão oficial), além de remoção posterior dos arquivos de Docker/Compose (commit `cb4708a9`).

- **Revisão de estabilidade, cache de statements e segurança (07/10/2026):**
  - Correções de concorrência em agendamentos, download/restauração de banco via snapshot SQLite íntegro, rejeição estrita de parâmetros inválidos, cache `_preparado` aplicado nas queries fixas dos repositórios e mitigação de rejeições assíncronas em `BaseController.handleSync`.

- **Campanhas aprimoradas e sino de notificações (02/10/2026):**
  - Seleção específica de público (*todos*, *por cidade* ou *clientes escolhidos* — Migração 7, [ADR-0009](docs/ARQUITETURA.md#adr-0009)), filtros na lista de escolha, adição/remoção no detalhe, agendamento em lote de pendentes, criação a partir de quem faltou e alertas de prazo vencido/hoje no sino. Removida a exportação `.xlsx` isolada de pendentes a pedido da equipe.

- **Administração, backups sob demanda e avisos de alteração não salva (01/10/2026):**
  - Gerenciamento completo de contas de terceiros em *Pessoas* (nome, redefinição de senha, encerramento de sessões e exclusão segura), pendências acionáveis no topo da Administração, botão *Fazer cópia agora* em Backups + correção da ordem cronológica de poda, conferência de cadastros sem sistema/referência em *Dados*, classificação de sistemas em lote, *Copiar para o suporte* em Diagnóstico e alerta contra perda ao sair/recarregar com alterações não salvas.

- **Alertas CodeQL e correções pontuais (01/10/2026):**
  - Validação e normalização explícita de caminhos nas rotas de download/restauração de backup e redesenho da aba *Sobre e ajuda*.

---

### Agosto — Setembro de 2026 (marcos consolidados)

- **Vocabulário único, prazo oficial e sistemas dependentes (29–30/09/2026):** abolição do termo legado em todo o projeto via `vocabulario.test.mjs` ([ADR-0014](docs/ARQUITETURA.md#adr-0014)); definição de regra única pela data da última atualização contra a oficial com prazo configurável padrão de 60 dias e herança de data do `B_Vendas` para dependentes (`B_NFCe`, `Consignado M2` — [ADR-0008](docs/ARQUITETURA.md#adr-0008), [ADR-0013](docs/ARQUITETURA.md#adr-0013)).
- **HTTPS obrigatório, CSRF e verificação estática sem build (29/09/2026):** obrigatoriedade de HTTPS em produção atrás de proxy ([ADR-0010](docs/ARQUITETURA.md#adr-0010)), proteção CSRF por token de sessão ([ADR-0011](docs/ARQUITETURA.md#adr-0011)), checagem estática `tsc --noEmit` no código puro ([ADR-0006](docs/ARQUITETURA.md#adr-0006)) e registro da suíte CDP temporária ([ADR-0012](docs/ARQUITETURA.md#adr-0012)).
- **Campanhas, Ficha 360° e normalização relacional (11–28/09/2026):** migrações numeradas normalizando sistemas/clientes em tabelas de ligação ([ADR-0007](docs/ARQUITETURA.md#adr-0007)), versões oficiais por sistema com referência de data/autoria, módulo de Campanhas, relatórios de atualização, padronização de nomes de sistemas/responsáveis, acessos remotos por cliente e Ficha 360°.
- **Configurações por conta, sino, acessibilidade e reorganização modular (set/2026):** migração de preferências para o banco por conta, sino unificado de avisos, paleta de perfis/contraste/densidade, reorganização de `client/js/` por responsabilidade ([ADR-0005](docs/ARQUITETURA.md#adr-0005)) e adoção da tag `html` segura em toda marcação.
