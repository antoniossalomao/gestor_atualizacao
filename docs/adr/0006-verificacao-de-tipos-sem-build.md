# ADR-0006 — Verificação de tipos sem etapa de build, escopada ao código puro

**Situação:** Aceita

## Contexto

O [ADR-0001](0001-sem-framework-e-sem-build.md) aceitou explicitamente um custo:
*"Sem checagem de tipos. Mitigado com JSDoc nas assinaturas públicas."*

Na prática, a mitigação valia menos do que parecia. O JSDoc existia, mas
**ninguém o verificava** — então ele envelhecia sem que nada reclamasse. Uma
auditoria encontrou quatro anotações desatualizadas em produção, todas do mesmo
tipo: o código estava certo, a documentação é que ficara para trás.

A pior delas: `View.js` declarava `navigate?: (aba: string) => void`, mas a
implementação real é `(destino, opcoes) => this.switchTab(destino, opcoes)`. Ou
seja, a assinatura documentada dizia que **não dá para passar filtros ao trocar
de aba** — exatamente o que `ResumoView` e `AgendamentosView` fazem, e precisam
fazer. Quem fosse confiar na anotação concluiria que aquele código estava errado.

O caminho óbvio — migrar para TypeScript — reintroduziria o passo de build que o
ADR-0001 rejeitou por razões que continuam válidas.

## Decisão

Usar o TypeScript **apenas como conferente**, com `checkJs` e `noEmit`, sobre o
JavaScript que já existe e o JSDoc que ele já tem. Nada é compilado, nada é
gerado: o que roda no navegador continua sendo exatamente o que está em
`client/`.

A verificação é **escopada ao código puro dos dois lados**:

| Config | Cobre | Critério |
|---|---|---|
| `client/tsconfig.json` | `js/domain/`, `js/utils/` | não tocam no DOM ([ADR-0005](0005-organizacao-do-client-por-responsabilidade.md)) |
| `server/tsconfig.json` | `src/shared/`, `services/normalizacao.js` | não falam com o Node nem com o banco |

Nos dois casos a `lib` do TypeScript é só `es2022` — sem `dom`, sem `node`. É
essa ausência que torna o critério automático: um arquivo novo que precise do
`document` ou do `fs` para passar está na pasta errada, e o erro é o aviso.

Execução por `npm run check`, também no CI.

Modo estrito ligado, **exceto `noImplicitAny`**.

## Consequências

**Ganhos**
- JSDoc passa a ter consequência. Uma anotação que mente vira erro no CI, em vez
  de virar armadilha para quem lê.
- Nessas pastas o resultado é binário: **zero erros, ou achou algo real.**
  Não existe a categoria "aviso conhecido que a gente ignora".
- Editores que leem `tsconfig.json` passam a marcar o erro enquanto se digita,
  sem configuração por pessoa.
- Custo zero em tempo de execução e nenhuma dependência nova no navegador. O
  TypeScript é `devDependency` da raiz; `client/` continua sem dependência
  alguma, como o ADR-0001 exige.
- Um arquivo novo em `domain/` ou `utils/` entra na rede automaticamente. Se
  precisar do DOM para passar, isso é o sinal de que está na pasta errada — e
  esse aviso é parte do valor.

**Custos aceitos**
- **A maior parte do front-end fica de fora.** `views/`, `components/` e `app/`
  não são verificados: ali o mesmo comando produz ~350 erros, e praticamente
  todos são o mesmo ruído (`querySelector` devolve `Element`, e ler `.style` ou
  `.disabled` daí exige *cast*). Não são defeitos; são o preço de manipular DOM
  sem tipos. Um relatório com 350 avisos falsos não é lido por ninguém, e um
  portão que ninguém lê não é portão.
- `noImplicitAny` desligado deixa passar parâmetro sem anotação (~80 casos
  hoje). Ligá-lo transformaria isto numa campanha de anotar assinatura, e não é
  daí que vêm os erros: o valor está em pegar `null` onde se espera número, não
  em exigir cerimônia.
- Mais uma ferramenta para manter atualizada.

**O que isso já encontrou**, na primeira execução:

- **Um bug de verdade, em produção.** `SaudeService` lia
  `this.versoes.packagesDir` — propriedade que `VersaoService` **nunca teve**.
  Como `fs.existsSync(undefined)` devolve `false` em vez de lançar, o painel de
  Saúde reportava *"0 pacotes, 0 bytes"* para sempre, sem erro no log. O teste
  que existia não pegava: o dublê de `versoes` declarava `packagesDir`, ou seja,
  o teste afirmava uma interface que o objeto real não implementava. Ninguém
  notaria olhando a tela — zero é um número plausível demais.
- Quatro anotações JSDoc desatualizadas (`View.js`, `Toast.js`,
  `SortableTable.js`, `ConfiguracoesPanel.js`), onde o código estava certo e a
  documentação é que ficara para trás.
- Uma subtração de datas que só funcionava por coerção implícita
  (`DistribuicaoView.js`) e duas comparações que dependiam do mesmo tipo de
  regra tácita (`agenteStatus.js`, `normalizacao.js`).

## Alternativas consideradas

- **Migrar para TypeScript de verdade** — descartado: reintroduz o passo de
  build, que é justamente o que o ADR-0001 comprou ao abrir mão de tipos. Daria
  cobertura total, mas custaria a propriedade mais valiosa do front-end (o que
  está no disco é o que o navegador executa).
- **Rodar `checkJs` no projeto inteiro e conviver com os erros** — descartado:
  350 avisos falsos treinam a equipe a ignorar a saída da ferramenta, o que é
  pior que não ter ferramenta.
- **Adicionar *casts* JSDoc em massa para calar o ruído de DOM** — descartado:
  seriam centenas de anotações escritas para agradar a ferramenta, não para
  comunicar algo a quem lê. Piora o código para melhorar um número.
- **ESLint em vez de verificação de tipos** — descartado *para este problema*.
  ESLint pega estilo e erros sintáticos; não pegaria nenhum dos seis achados
  acima, que são todos de tipo. Continua sendo uma adição possível, ortogonal a
  esta.
