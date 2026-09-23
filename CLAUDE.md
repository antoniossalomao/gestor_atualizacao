# Instruções para agentes de IA neste repositório

Leia [`CONTRIBUTING.md`](CONTRIBUTING.md) antes de alterar qualquer coisa. Este
arquivo resume só o que é **não óbvio** e o que mais se erra por aqui.

## Verificar antes de dizer que terminou

```bash
cd web
npm run check     # tipos (client/js/domain, client/js/utils, server/src/shared)
npm test          # ~745 testes (servidor + cliente)
```

Os dois têm que passar. Não relate conclusão sem ter rodado.

## O que NÃO fazer

- **Não introduza etapa de build no front-end.** Sem bundler, sem transpilação,
  sem TypeScript de verdade. O que está em `client/` é exatamente o que o
  navegador executa, e isso é uma decisão registrada
  ([ADR-0001](docs/adr/0001-sem-framework-e-sem-build.md)), não uma pendência.
- **Não adicione dependência de front-end.** `client/` não tem `node_modules`,
  e é para continuar assim.
- **Não troque comentário "por quê" por comentário "o quê".** Os comentários
  longos deste repositório registram armadilhas reais, muitas descobertas em
  produção. Apagar um deles apaga o motivo de o código ser daquele jeito. Ao
  corrigir um bug não óbvio, **acrescente** o porquê.
- **Não escreva em inglês** nomes de domínio, mensagens ao usuário ou
  comentários. Inglês só onde a linguagem impõe (`get`, `catch`, `async`).
- **Não use `sortBy` da URL direto no SQL.** Use `shared/sortHelper.js`.
- **Não monte HTML com template literal cru.** Use a tag `html` de
  `js/utils/html.js`, que escapa tudo o que é interpolado. Os ícones entram
  com `iconHtml()`. `confiavel()` só vale para marcação gerada pelo próprio
  código. `client/tests/html-seguro.test.mjs` trava a contagem por arquivo.

## Onde colocar arquivo novo

**Servidor** — `routes/ → controllers/ → services/ → database/`. Cada camada só
conhece a de baixo. SQL **só** em `database/`. `shared/` é para o que tem dois
consumidores em camadas diferentes — não antes disso.

**Regra que vale para a equipe inteira** (um prazo, um limite, uma URL de
integração) **não vai no `.env` nem numa constante**: entra em
`server/src/config/regrasEquipe.js` e aparece na tela Administração. O `.env`
é só para infraestrutura e segredos.

**Front-end** — a regra, na ordem em que se pergunta:

1. Precisa do DOM? Se **não** → `utils/` (genérico), `domain/` (fala de
   cliente/atualização/agente) ou `templates/` (marcação montada com a tag
   `html`, que a view só joga num `innerHTML`).
2. É reaproveitável entre telas? → `components/`.
3. É uma tela? → `views/`.
4. É o esqueleto (rota, tema, preferências, cache)? → `app/`.

`domain/`, `templates/` e `utils/` **não podem tocar no DOM** — não é estilo, é o que os
torna testáveis fora do navegador e é o que `npm run check` verifica. Se um
arquivo só passa quando alcança o `document`, ele está na pasta errada.

## Testes

O critério não é cobertura: é **toda regra que, se quebrar, erra em silêncio
tem teste**. Permissão, validação de data, ordenação, paginação, roteamento,
propagação de rename, normalização de nomes.

Testes sobem um `Server`/`Database` de verdade num diretório temporário. Sem
mock de banco. Dois detalhes que já custaram uma rodada vermelha:

- `repositorio.list()` devolve `{ rows, total, page, pageSize }` — **não**
  `items` — e **não ordena por id**.
- `list()` não traz `criado_em`/`concluido_em`; só `find(id)` traz.

## Ao terminar

Se mudou comportamento visível, acrescente ao [`CHANGELOG.md`](CHANGELOG.md).
Se tomou uma decisão cara de reverter, escreva um ADR em [`docs/adr/`](docs/adr/).
Não faça commit nem push sem o usuário pedir.
