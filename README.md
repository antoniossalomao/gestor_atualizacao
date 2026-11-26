# Gestor de Atualizações

Painel web para controlar as atualizações de sistemas instalados em clientes: o que foi atualizado, em quem, por quem e quando. Roda como um servidor na rede da empresa e a equipe acessa pelo navegador, cada pessoa com seu próprio login.

> **Escopo das melhorias:** o **Atualizador Automático** (agentes, distribuição e publicação de pacotes) está pausado. Pedidos gerais de análise, planejamento ou melhoria cobrem apenas o painel de gestão, salvo pedido explícito de retomada desse módulo.

**Stack:** Node.js (`>= 20.6.0`, testado/CI em `22`) + Express 5 + SQLite (`better-sqlite3`) no servidor, e HTML/CSS/JavaScript puro (ES Modules nativos) no navegador — **sem framework e sem etapa de build**.

## Telas e recursos principais

- **Atualizações:** registro central de atualizações por cliente, sistemas, versão (oficial cadastrada ou edição manual), responsável, data, motivo, máquinas e observações. Traz toolbar unificada com busca instantânea, filtros de data com chips ativos, importação/exportação `.xlsx` com prévia em transação única, seleção em lote (`Shift` + clique) e relatórios em texto limpo ou impressão/PDF.
- **Clientes e Ficha 360°:** cadastro com código, cidade, grupo/rede, regime tributário e sistemas contratados; ação direta para gerenciar IDs de acesso remoto por máquina com cópia rápida e modal completo com matriz de versões e histórico.
- **Agendamentos:** tarefas internas da equipe em colunas Kanban (*A Fazer*, *Em Andamento*, *Sem resposta*, *Concluído*) com prioridade, sistema, observação, arrastar-e-soltar, conversão em atualização e arquivamento automático após o prazo configurado.
- **Resumo:** visão geral dos últimos **60 dias** com cards de KPI interativos, gráficos por responsável e por sistema (com comparativo mensal e clique para filtrar), tendência de 12 meses e situação consolidada das versões dos clientes.
- **Sistemas:** filtro padrão em `B_Vendas` (ordenado pela última atualização), consulta da situação de cada cliente contra as **versões oficiais** cadastradas com autoria, data de referência e trava de edição concorrente. Sistemas marcados como dependentes acompanham a data do `B_Vendas`.
- **Campanhas:** metas temporárias de versão para todos os clientes do sistema, por cidade ou para uma lista selecionada, com acompanhamento ao vivo, agendamento em lote de pendentes, criação a partir de quem faltou e congelamento de placar ao encerrar.
- **Administração (apenas administradores):** dividida em 7 seções verticais com busca rápida e índice lateral:
  1. *Pessoas e permissões* (contas, papéis RBAC e sessões abertas);
  2. *Operação* (prazos da equipe e classificação em lote dos sistemas);
  3. *Dados* (exportação, importação em lote, conferência de cadastros e download do banco);
  4. *Integrações* (webhook do Discord com teste e chave do Atualizador);
  5. *Backups e recuperação* (cópias automáticas na subida e criação manual sob demanda, download e restauração com senha + confirmação `RESTAURAR`);
  6. *Auditoria* (histórico de alterações por entidade e autor);
  7. *Diagnóstico* (saúde do servidor, integridade do SQLite, WAL, sessões, métricas e cópia para o suporte).
- **Configurações (por conta):** preferências sincronizadas entre navegadores em 6 seções (*Minha conta*, *Trabalho diário*, *Notificações*, *Interface e acessibilidade*, *Regras da equipe*, *Sobre e ajuda*), com perfis prontos, prévia ao vivo, 9 paletas de realce (padrão Creme/Off-white matte em tema escuro e claro) e zoom padrão de 90%.

## Estrutura do repositório

```text
README.md                   Visão geral do sistema, setup local e mapa dos arquivos
CLAUDE.md                   Instruções rápidas para agentes de IA
CHANGELOG.md                Diário cronológico das mudanças e decisões
package.json                Scripts unificados na raiz (start, dev, test, check, lint)

server/                     Backend Express 5 + SQLite (CommonJS)
  server.js                 Ponto de entrada: carrega .env e inicia o Server
  resetar-senha.js          Utilitário CLI de recuperação de acesso administrativo
  ferramentas/              Scripts operacionais (ex.: medir-planilhas.js)
  src/
    Servidor.js             Composição raiz, middlewares HTTP/CSP e ciclo de vida
    config/                 Constantes, regras padrão da equipe, transporte e sessão
    routes/                 Mapa central de rotas (/api/*) e middlewares de acesso
    controllers/            Adaptação HTTP entre Express e serviços
    services/               Regras de negócio, validações puras e backup
    database/               Repositórios por tabela, migrações numeradas e sessão SQLite
    shared/                 Utilitários compartilhados entre camadas
  tests/                    Testes automatizados (node --test, sem mock de banco)

client/                     Front-end HTML/CSS/JS puro (ES Modules, sem dependências)
  index.html                Shell SPA e carregamento do tema inicial sem FOUC
  css/                      theme.css (tokens), components.css (componentes), layout.css (acabamento)
  js/
    main.js / api/          Bootstrap e cliente HTTP único (ApiPainel.js)
    app/                    Shell, roteador, tema, aparência, preferências, atalhos e cache SWR
    domain/                 Regras e vocabulário puro (sem DOM)
    templates/              Templates seguros com tag `html` (sem DOM)
    components/             Componentes de UI reutilizáveis e gráficos SVG
    views/                  Telas e subpainéis de Administração e Configurações
  tests/                    Testes de domínio, segurança HTML/CSS, vocabulário e módulos

proxy/Caddyfile             Configuração do proxy reverso HTTPS (Caddy)
scripts/deploy-windows.ps1  Atualização segura de código no servidor Windows (NSSM)
docs/
  ARQUITETURA.md            Desenvolvimento, segurança, dependências e ADRs (0001–0014)
  OPERACAO.md               Implantação (Windows/NSSM, Azure App Service/VM) e runbook
```

## Como rodar localmente (desenvolvimento)

Requer **Node.js `>= 20.6.0`** (produção e CI utilizam Node `22`).

```powershell
# 1. Instalar dependências do servidor e do verificador de tipos da raiz
npm run install:all
npm install

# 2. Configurar ambiente do servidor
Copy-Item server\.env.example server\.env
# Edite server\.env e troque SESSION_SECRET por um valor aleatório longo:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Subir o painel em modo de desenvolvimento
npm run dev
```

Abra `http://localhost:3000`. Na primeira execução com banco vazio, a tela cria a conta inicial de administrador. Para usar um `gestao.db` existente, copie-o para `server/data/gestao.db` ou aponte `DB_PATH` em `server/.env` (use sempre uma cópia em desenvolvimento); as migrações rodam automaticamente na subida.

### Scripts da raiz

| Comando | O que faz |
|---|---|
| `npm start` | Inicia o servidor em produção (`server/server.js`) |
| `npm run dev` | Inicia o servidor com reinício automático (`nodemon`) |
| `npm test` | Executa toda a suíte de testes do servidor e do cliente (`node --test`) |
| `npm run check` | Executa a checagem estática de tipos (`tsc --noEmit`) nas camadas puras |
| `npm run build` / `npm run lint` | Atalho para `npm run check` |
| `npm run resetar-senha -- <usuario> "<nova-senha>"` | Redefine a senha de qualquer conta direto no banco |

## Variáveis de ambiente (`server/.env`)

As **regras da equipe** (prazos, retenção de backups, webhook do Discord, URL pública e liga/desliga do Atualizador) ficam no banco e são editadas na tela **Administração** sem reiniciar. O arquivo `.env` guarda apenas infraestrutura e segredos (ver [`server/.env.example`](server/.env.example)):

| Variável | Função |
|---|---|
| `PORT` | Porta HTTP ou named pipe (`3000` por padrão) |
| `DB_PATH` | Caminho do arquivo `gestao.db` (padrão `./data/gestao.db`) |
| `SESSION_SECRET` | Chave de assinatura das sessões (**obrigatória** e diferente do exemplo) |
| `AGENT_API_TOKEN` | Token compartilhado com agentes do Atualizador (valor de exemplo recusado) |
| `SESSION_SECURE` | `true` atrás de proxy HTTPS; vazio em HTTP local |
| `TRUST_PROXY` | `true` quando atrás de proxy reverso (Caddy ou Azure App Service) |
| `HOST` | `127.0.0.1` atrás de Caddy local; vazio no Azure App Service |

## Controle de acesso (RBAC) e backups

- **`admin`:** acesso completo (pessoas/papéis, regras da equipe, backups/restauração, auditoria, integrações, diagnóstico, publicação de versões). O sistema bloqueia exclusão ou rebaixamento do último administrador.
- **`operador`:** rotina operacional de atualizações, clientes, acessos remotos, agendamentos e rascunhos de versão.
- **`consulta`:** apenas leitura, relatórios e exportação `.xlsx` (sem leitura de acessos remotos nem ações de escrita).

A cada inicialização (e antes de migrações pendentes), uma cópia verificada com `PRAGMA integrity_check` é gravada em `server/data/backups/`. A restauração pelo painel exige conta administradora, confirmação textual `RESTAURAR`, senha atual e invalida todas as sessões abertas.

## Documentação

| Documento | Quando consultar |
|---|---|
| [`README.md`](README.md) | Visão geral do painel, estrutura e partida rápida em desenvolvimento |
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | Como desenvolver no código, regras de pastas/testes/segurança e decisões (ADRs 0001–0014) |
| [`docs/OPERACAO.md`](docs/OPERACAO.md) | Implantação em produção (Windows NSSM + Caddy, Azure) e runbook de incidentes |
| [`CHANGELOG.md`](CHANGELOG.md) | Histórico cronológico de alterações e contexto das decisões |
| [`CLAUDE.md`](CLAUDE.md) | Instruções resumidas de trabalho para agentes de IA neste repositório |

## Licença

Proprietária — ver [`LICENSE`](LICENSE).
