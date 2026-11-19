# Instruções para agentes de IA neste repositório

Leia [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) antes de alterar qualquer coisa. Este arquivo resume apenas o que é **não óbvio** e o que mais se erra neste projeto.

## Verificar antes de dizer que terminou

```bash
npm run check     # tipos e "sem DOM" (client/js/domain, templates, utils; núcleo puro do servidor)
npm test          # servidor + cliente
```

Os dois precisam passar limpos. Não relate conclusão sem tê-los executado após a última edição.

Mexeu em tela, componente ou CSS? O repositório não tem testes de navegador ([ADR-0012](docs/ARQUITETURA.md#adr-0012)) e `npm test` não enxerga modal encoberto por gaveta nem foco perdido ao fechar formulário: abra a tela no navegador, nos dois temas, e confira o que mudou.

## O que NÃO fazer

- **Não introduza etapa de build no front-end.** Sem bundler, sem transpilação, sem TypeScript compilado. O que está em `client/` é exatamente o que o navegador executa ([ADR-0001](docs/ARQUITETURA.md#adr-0001)).
- **Não adicione dependência de front-end.** `client/` não tem `node_modules`, e deve continuar assim.
- **Não troque comentário "por quê" por comentário "o quê".** Os comentários longos deste repositório registram armadilhas reais de produção. Preserve-os e acrescente o porquê ao corrigir bugs não óbvios.
- **Não escreva em inglês** nomes de domínio, mensagens ao usuário ou comentários. Inglês só onde a linguagem impõe (`get`, `catch`, `async`). Nunca use o termo legado proibido por `client/tests/vocabulario.test.mjs` (use sempre `"atualização"`).
- **Não use `sortBy` da URL direto no SQL.** Use `server/src/database/ordenacao.js`.
- **Não monte HTML com template literal cru.** Use a tag `html` de `client/js/utils/html.js`, que escapa tudo o que é interpolado. Os ícones entram com `iconeHtml()`. `confiavel()` só vale para marcação gerada pelo próprio código. `client/tests/html-seguro.test.mjs` trava a contagem por arquivo.

## Onde colocar arquivo novo

- **Servidor** — `routes/ → controllers/ → services/ → database/`. Cada camada só conhece a de baixo. SQL **só** em `database/`. `shared/` é para o que tem dois consumidores em camadas diferentes — não antes disso.
- **Regra que vale para a equipe inteira** (prazo, limite, URL de integração) **não vai no `.env` nem em constante fixa**: entra em `server/src/config/regrasEquipe.js` e aparece na tela Administração. O `server/.env` é só infraestrutura e segredos.
- **Front-end** — na ordem em que se pergunta:
  1. Precisa do DOM? Se **não** → `utils/` (genérico), `domain/` (regra de negócio) ou `templates/` (marcação com a tag `html`, que a view injeta via `innerHTML`).
  2. É reaproveitável entre telas? → `components/`.
  3. É uma tela? → `views/`.
  4. É o esqueleto (rota, tema, preferências, cache)? → `app/`.

`domain/`, `templates/` e `utils/` **não podem tocar no DOM** — `npm run check` e `html-seguro.test.mjs` conferem isso. Se um arquivo só passa acessando `document`, está na pasta errada.

## Testes

O critério não é percentual de cobertura: **toda regra que, se quebrar, erra em silêncio precisa de teste** (permissão, validação de data, ordenação, paginação, roteamento, propagação de rename, normalização de nomes).

Testes sobem um `Server`/`BancoDeDados` real em diretório temporário, sem mock de banco:
- `repositorio.list()` devolve `{ rows, total, page, pageSize }` — **não** `items` — e **não ordena por id**.
- `list()` não traz `criado_em`/`concluido_em`; só `find(id)` traz.

## Ao terminar

- Se mudou comportamento visível, acrescente ao [`CHANGELOG.md`](CHANGELOG.md).
- Se tomou uma decisão cara de reverter, registre-a como ADR em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md#3-decisões-de-arquitetura-adrs).
- Não faça `commit` nem `push` sem o usuário pedir.

## Segundo Cérebro (Obsidian / "Vault")

O Vault **é um repositório GitHub**: `antoniossalomao/vault` (privado), não uma pasta local nem um MCP no PC do usuário. Em sessão na nuvem, anexe-o com `add_repo` (`access: "push"`), leia o `claude.md` da raiz dele e grave a nota em `Recursos/Claude/Conversas/`. Não responda "não tenho acesso ao Vault": se o `add_repo` for negado, diga que foi negado e peça ao usuário para liberar.
