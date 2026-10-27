# Relatório de Limpeza, Auditoria de Bugs e Reestruturação

Data: 27/10/2026  
Branch de trabalho: `chore/cleanup-20261027`

---

## 1. Stack Detectada e Baseline vs. Resultados Finais

### Stack
- **Ambiente de Execução:** Node.js (>= 20.6.0, rodando com v24.19.0)
- **Backend:** Express 5.2.1, SQLite via `better-sqlite3` 13.0.3, `express-session`, `helmet`, `compression`, `express-rate-limit`, `exceljs`, `multer`, `bcryptjs`, `dotenv`.
- **Frontend:** Vanilla JavaScript (ES Modules nativos, sem bundler nem transpilação), HTML5 semântico, CSS3 com variáveis CSS nativas. Ponto de entrada: `client/index.html`.
- **Verificação Estática e Tipos:** TypeScript 5.2.2 (`tsc --noEmit`) operando como conferente de tipos via JSDoc nas camadas puras (`client/tsconfig.json` e `server/tsconfig.json`).
- **Testes:** Executor nativo do Node.js (`node --test`), com flag `--experimental-vm-modules` para o cliente.
- **Deploy & Infraestrutura:** Dockerfile multi-stage com base distroless Debian/glibc, Docker Compose e proxy reverso Caddy.

### Baseline vs. Final

| Métrica / Portão | Baseline (Fase 0) | Final (Fase 6) | Variação |
|---|---|---|---|
| **Erros de Tipo (`check:client`)** | 0 erros | 0 erros | Mantido (0) |
| **Erros de Tipo (`check:server`)** | 0 erros | 0 erros | Mantido (0) |
| **Testes do Cliente (`test:client`)** | 537 aprovados, 0 falhas | 537 aprovados, 0 falhas | Mantido (100% pass) |
| **Testes do Servidor (`test:server`)** | 662 aprovados, 0 falhas | 668 aprovados, 0 falhas | +6 testes novos |
| **Total de Testes Automatizados** | 1.199 aprovados | 1.205 aprovados | +6 testes (+0.5%) |
| **Taxa de Sucesso dos Testes** | 100% | 100% | 0 falhas |
| **Avisos / Alertas no Build** | 0 | 0 | Limpo |

---

## 2. Métricas de Limpeza

- **Arquivos removidos:** 0 (nenhum arquivo órfão encontrado; todos os 275 arquivos do projeto possuem uso real comprovado).
- **Arquivos movidos/reorganizados:** 1 (`relatorio.md` movido para `docs/relatorio.md`).
- **Arquivos novos criados:** 2 (`server/tests/baseController.test.js` e `docs/CLEANUP_REPORT.md`).
- **Linhas adicionadas:** 144
- **Linhas removidas:** 20
- **Dependências removidas/adicionadas:** 0 (todas as 10 dependências de produção e 1 de desenvolvimento do `server/package.json` possuem uso ativo comprovado).
- **Scripts de manifesto padronizados:** adicionados `npm run build` e `npm run lint` ao `package.json` raiz.

---

## 3. Itens Removidos por Categoria com Justificativa

### Código Morto (Imports e Variáveis Não Utilizadas)
1. `client/js/views/FichaClienteModal.js` (`iconeSvg`): importado do utilitário de ícones mas nunca referenciado no módulo.
2. `client/js/views/FichaClienteModal.js` (`escaparHtml`): importado de `utils/html.js` mas desnecessário devido ao uso da template tag `html`.
3. `client/js/views/FichaClienteModal.js` (`painelVersoes`, `situacaoSistemas`): desestruturados de `this` em `_renderizarConteudo` sem uso local (a renderização das abas acessa `this.painelVersoes` diretamente).
4. `server/tests/adminContas.test.js` (`CHROME_WINDOWS`, `FIREFOX_LINUX`): constantes de User-Agent declaradas no cabeçalho do teste mas nunca lidas nas asserções.
5. `server/tests/seguranca.test.js` (`json`): variável local declarada em dois testes de middleware mas nunca checada, gerando aviso do TypeScript (TS6133). Substituído por descarte padronizado `json: () => {}`.

### Código Duplicado Unificado
1. `client/js/domain/campanhas.js` (`normalizar(v)`): reimplementava a mesma lógica de normalização de acentos e caixa já existente e testada em `client/js/utils/busca.js` (`normalizarBusca`). Refatorado para reutilizar `normalizarBusca`.

---

## 4. Bugs Corrigidos

### 1. Suporte a Promessas e Tratamento de Rejeição em `BaseController.handleSync`
- **Arquivo:** `server/src/controllers/BaseController.js` (linhas 6-25)
- **Descrição:** O método `handleSync` encapsulava a execução de handlers em bloco `try/catch` síncrono. Caso um handler chamasse ou retornasse uma promessa que rejeitasse assincronamente, o `try/catch` síncrono não capturava a rejeição, gerando `unhandledRejection` e deixando a resposta HTTP sem fechamento.
- **Causa Raiz:** Ausência de interceptação do retorno `thenable`/`Promise`.
- **Correção:** Adicionada detecção de retorno com método `then`. Promessas têm seu resultado resolvido enviado via `res.json(resolved)` / `res.end()` e qualquer rejeição encaminhada imediatamente para `next(err)`.
- **Teste Adicionado:** `server/tests/baseController.test.js` (6 testes cobrindo retornos síncronos, valores `undefined`, exceções síncronas, resolução assíncrona com status customizado e rejeições assíncronas).
- **Commit:** `c859ee8` (`fix: support promise rejections in BaseController.handleSync`).

---

## 5. Bugs Encontrados mas NÃO Corrigidos (Para Decisão de Produto)

Nenhum bug crítico bloqueante foi encontrado. O código auditado demonstra alto padrão de robustez com testes ponta a ponta bem elaborados.

---

## 6. Segurança e Ações Tomadas

1. **Varredura de Segredos e Credenciais:**
   - Nenhuma chave de API, segredo de sessão ou credencial em texto claro foi commitada no repositório.
   - O arquivo local `.env` não está rastreado pelo Git.
   - As variáveis críticas (`SESSION_SECRET`, `AGENT_API_TOKEN`) continuam documentadas apenas em `.env.example` com valores de placeholder obrigatórios.
2. **Higiene do `.gitignore`:**
   - Adicionados artefatos de build temporários (`client/css/app.min.css`), diretórios de editores/IDE (`.vscode/`, `.idea/`), arquivos de swap/backup (`*.swp`, `*.bak`, `*.tmp`, `*.orig`) e arquivos de sistema operacional (`.DS_Store`, `Thumbs.db`).
3. **Prepared Statements Caching no SQLite:**
   - Auditados todos os repositórios em `server/src/database/`. Confirmado que todas as consultas estáticas utilizam `this._preparado(...)` e apenas queries com cláusulas dinâmicas (como `IN (...)`) usam `this.conn.prepare(...)`, sanando a regressão histórica descrita em `relatorio.md`.
4. **Proteção contra ReDoS e Injeção:**
   - Todas as ordenações da API passam pela validação rigorosa de whitelist em `montarOrdenacao` com `Object.hasOwn(sortMap, sortBy)`.
   - Sanitização estrita contra XSS em atributos e conteúdos com a tag `html` em todo o frontend.

---

## 7. Mapeamento de Arquivos Reorganizados (Old Path -> New Path)

| Caminho Original | Novo Caminho | Justificativa |
|---|---|---|
| `relatorio.md` | `docs/relatorio.md` | Manter a raiz limpa contendo apenas manifestos e arquivos de configuração; centralizar relatórios e documentações na pasta `docs/`. |

---

## 8. Lista de Itens "Incertos" (Não Removidos por Prudência)

1. `server/src/shared/normalizacao.js` (`APELIDOS`, `LIXO`, `SISTEMAS_NOVOS`):
   - Exportados no `module.exports` mas com uso interno predominante. Mantidos intactos para preservar a API pública do módulo de normalização e compatibilidade com scripts de terceiros ou ferramentas auxiliares.
2. `server/ferramentas/medir-planilhas.js`:
   - Ferramenta de benchmark CLI de importação/exportação citada em `docs/OPERACAO.md`. Mantida em sua localização por ser utilitário operacional de medição de performance.
3. `client/js/components/AvisosRapidos.js` (`GerenteDeAvisos`):
   - A classe é exportada junto com o singleton `avisoRapido`. Mantida para viabilizar instanciações isoladas em testes futuros.

---

## 9. Mudanças Observáveis de Comportamento

Nenhuma mudança externamente observável de comportamento foi introduzida. Rotas, formatos de resposta JSON, schemas do banco de dados, variáveis de ambiente e convenções visuais foram 100% preservados.

---

## 10. Recomendações e Próximos Passos

1. **Configurar Linter Formal:**
   - O projeto já possui checagem de tipos estrita em `client` e `server` via `npm run check`. Recomenda-se adicionar uma configuração leve de ESLint (ou Biome) rodando no script `npm run lint`.
2. **Integração no CI:**
   - Incluir a execução de `npm run check` e `npm run test` no workflow do GitHub Actions em todas as pull requests.

