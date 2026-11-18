# Instruções para agentes de IA neste repositório

Projeto: Gestor de Atualizações. Servidor Node ≥ 20.6 (Express 5, better-sqlite3, CommonJS) e front-end em JavaScript puro.
Responda em português do Brasil, de forma direta. Leia [`CONTRIBUTING.md`](CONTRIBUTING.md) antes de alterar qualquer coisa; este arquivo resume só o que é **não óbvio**.

## Como trabalhar

1. **O usuário manda.** Faça o que foi pedido, mesmo que você ache que pode dar errado. Antes de executar, **avise o risco em uma ou duas frases e peça confirmação**; com o "sim", execute sem insistir nem refazer a discussão.
2. **Rápido e bem feito.** Escolha o caminho mais rápido que não sacrifique qualidade. Leia só o contexto necessário, sem buscas e testes repetidos. Agir quando já há informação suficiente.
3. **Frameworks e dependências.** Se atualizar, trocar ou remover um framework ou biblioteca melhorar o resultado, **sugira e pergunte** (ganho, risco, esforço). Nunca altere `package.json` ou o lockfile por conta própria.
4. **Repositório limpo.** Ao terminar cada tarefa: apague o lixo que você criou (rascunhos, logs, arquivos temporários, código morto, imports e comentários de depuração, saídas de teste), reorganize o que ficou fora de lugar e confira `git status`. Nada de arquivo solto na raiz. Rascunho vive fora do repositório.
5. **Git.** Trabalhe na branch `gestorv2`, commit pequeno e com mensagem clara, push dessa branch. **Só faça commit e push quando o usuário pedir.** Antes de qualquer ação difícil de desfazer (apagar, sobrescrever, `reset --hard`, `push --force`, mexer em arquivo que não é seu), olhe o alvo e confirme. Faça stage só dos arquivos da tarefa.
6. **Ordem de verdade.** Pedido do usuário > este arquivo > `docs/agents/` > seu julgamento.

## Nomes de arquivos: inglês

Arquivo, pasta e módulo **novos** têm nome em inglês (`kebab-case` ou o padrão da pasta). Nomes em português que já existem (`regrasEquipe.js`, `ordenacao.js`, `html-seguro.test.mjs`…) **não** são renomeados por conta própria: renomear exige atualizar todos os imports e docs, então proponha e peça confirmação. Isso vale só para **nomes de arquivo**: nomes de domínio no código, mensagens ao usuário e comentários continuam em português.

## Verificar antes de dizer que terminou

```bash
npm run check     # tipos e "sem DOM" (client/js/domain, utils, templates; núcleo puro do servidor)
npm test          # servidor + cliente
```

Os dois têm que passar. Não relate conclusão sem ter rodado.

## O que NÃO fazer

- **Não introduza etapa de build no front-end.** Sem bundler, sem transpilação, sem TypeScript de verdade. O que está em `client/` é exatamente o que o navegador executa ([ADR-0001](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0001)). **Não adicione dependência de front-end**: `client/` não tem `node_modules`. Os guias de `docs/agents/` que citam React, Tailwind, GSAP ou bibliotecas são só referência de princípio; para adotar qualquer uma, pergunte (é mudança de decisão registrada).
- **Não troque comentário "por quê" por comentário "o quê".** Os comentários longos registram armadilhas reais, muitas descobertas em produção. Apagar um deles apaga o motivo de o código ser daquele jeito. Ao corrigir um bug não óbvio, **acrescente** o porquê. (A reescrita dos comentários será pedida à parte pelo usuário; até lá, não mexa.)
- **Não use `sortBy` da URL direto no SQL.** Use `database/ordenacao.js`.
- **Não monte HTML com template literal cru.** Use a tag `html` de `js/utils/html.js`, que escapa tudo o que é interpolado. Ícones entram com `iconeHtml()`. `confiavel()` só vale para marcação gerada pelo próprio código. `client/tests/html-seguro.test.mjs` trava a contagem por arquivo.
- **Não invente** funcionalidade, dado, claim ou conteúdo (texto alternativo, rótulo, copy).

## Onde colocar arquivo novo

**Servidor** — `routes/ → controllers/ → services/ → database/`. Cada camada só conhece a de baixo. SQL **só** em `database/`. `shared/` é para o que tem dois consumidores em camadas diferentes, não antes disso.

**Regra que vale para a equipe inteira** (um prazo, um limite, uma URL de integração) **não vai no `.env` nem numa constante**: entra em `server/src/config/regrasEquipe.js` e aparece na tela Administração. O `.env` é só para infraestrutura e segredos.

**Front-end** — a pergunta, nesta ordem:

1. Precisa do DOM? Se **não** → `utils/` (genérico), `domain/` (fala de cliente/atualização/agente) ou `templates/` (marcação montada com a tag `html`, que a view só joga num `innerHTML`).
2. É reaproveitável entre telas? → `components/`.
3. É uma tela? → `views/`.
4. É o esqueleto (rota, tema, preferências, cache)? → `app/`.

`domain/`, `templates/` e `utils/` **não podem tocar no DOM**. Não é estilo: é o que os torna testáveis fora do navegador e é o que `npm run check` verifica. Se um arquivo só passa quando alcança o `document`, está na pasta errada.

## Front-end: guia de design

Não há testes de navegador (a suíte saiu em 29/09/2026) e `npm test` não enxerga modal aberto atrás da gaveta nem foco perdido ao fechar formulário. **Mexeu em tela, componente ou CSS? Abra a tela no navegador, nos dois temas (claro e escuro), e confira o que mudou** — teclado, foco, contraste. O sistema é **somente desktop** (largura mínima 1280 px): não projete nem teste para celular ou tablet.

Leia sob demanda, **só o que a tarefa pede** (não carregue tudo):

| Quando | Arquivo |
|---|---|
| Criar ou redesenhar tela, escolher cor/fonte/layout; tirar cara de "feito por IA" | [frontend-design.md](docs/agents/frontend-design.md) |
| Escrever ou revisar HTML/CSS/JS de interface (foco, formulário, animação, imagem, tema) | [frontend-interface-rules.md](docs/agents/frontend-interface-rules.md) |
| Criar ou refatorar componente (parâmetros booleanos, estado compartilhado) | [frontend-composition.md](docs/agents/frontend-composition.md) |
| Auditar ou corrigir acessibilidade | [frontend-accessibility.md](docs/agents/frontend-accessibility.md) |

Regras que valem sempre, sem abrir os arquivos:

- **Identidade visual é do usuário.** Paleta, fontes e tokens existentes não mudam sem perguntar. Tela nova ou mudança dentro da identidade atual: faça direto.
- Acessibilidade é piso, não extra: foco visível, `<button>`/`<a>` corretos, label em todo campo, `aria-label` em botão só de ícone, contraste AA, `prefers-reduced-motion`.
- Sem emoji como ícone, sem degradê/glow/sombra colorida, sem `transition: all`, sem caixa alta espaçada. Cor sempre por token, nunca hex cru em componente.
- Espaçamento na escala de 4px; um conjunto de ícones; um acento por tela.
- Este front é JavaScript puro: as regras de composição valem como princípio (variantes em vez de booleanos, estado num só lugar), sem API de React.

## Back-end: guia

Antes de mexer em rota, controller, service ou SQL, leia [backend-node.md](docs/agents/backend-node.md) (estrutura, erros, segurança de API, SQLite, performance).

Regras que valem sempre:

- Toda entrada validada com schema; SQL **só parametrizado**; coluna/ordem dinâmica só por lista permitida.
- Erro: só `Error`/subclasse, tratamento central, **stack nunca vai para o cliente**.
- Rota nova nasce com autenticação e checagem de permissão (padrão: negar).
- Lista sempre paginada. Esquema do banco só muda por migração versionada, com backup antes se for destrutiva.
- Não bloqueie o event loop; consulta curta e indexada (`EXPLAIN QUERY PLAN` na dúvida).

## Testes

O critério não é cobertura: é **toda regra que, se quebrar, erra em silêncio, tem teste**. Escreva só o essencial: permissão, validação de data, ordenação, paginação, roteamento, propagação de rename, normalização de nomes. Não crie teste para o que a leitura do código já garante.

Testes sobem um `Server`/`BancoDeDados` de verdade num diretório temporário. Sem mock de banco. Dois detalhes que já custaram uma rodada vermelha:

- `repositorio.list()` devolve `{ rows, total, page, pageSize }` — **não** `items` — e **não ordena por id**.
- `list()` não traz `criado_em`/`concluido_em`; só `find(id)` traz.

## Ao terminar

Se mudou comportamento visível, acrescente ao [`CHANGELOG.md`](CHANGELOG.md). Se tomou uma decisão cara de reverter, registre-a como nova subseção na [seção de decisões da documentação consolidada](docs/DOCUMENTACAO_CONSOLIDADA.md#4-decisões-de-arquitetura--adrs-do-painel-web). Depois, faça a limpeza do item 4 de "Como trabalhar".

## Segundo Cérebro ("Vault")

O Vault **é um repositório GitHub**: `antoniossalomao/vault` (privado), não uma pasta local nem um MCP no PC do usuário. Em sessão na nuvem, anexe-o com `add_repo` (`access: "push"`), leia o `claude.md` da raiz dele e grave a nota em `Recursos/"NomedoAgente"/Conversas/`. Não responda "não tenho acesso ao Vault": se o `add_repo` for negado, diga que foi negado e peça ao usuário para liberar.
