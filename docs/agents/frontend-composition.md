# Front-end: composição de componentes

Fonte: [vercel-labs/agent-skills · composition-patterns](https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns).

Estas regras nasceram em React. **Este front é JavaScript puro** (`components/` + tag `html`), então vale o princípio, não a API. Só aplique a parte React 19 se o projeto migrar para React (e isso é decisão do usuário: pergunte).

## Princípios (valem em JS puro)

1. **Nada de proliferação de booleanos.** `Card({ compacto, destaque, semBorda, … })` vira variantes explícitas (`CardCompacto`, `CardDestaque`) ou composição por partes. Cada booleano novo dobra os estados possíveis.
2. **Componente composto com contexto compartilhado.** Tela complexa (tabela com filtro, gaveta, formulário) = um contêiner que guarda o estado + partes pequenas (`Cabecalho`, `Corpo`, `Rodape`) que o consomem. O consumidor monta só o que precisa.
3. **Desacople a implementação do estado.** Só um lugar (o "provedor") sabe como o estado é guardado (memória, URL, cache). As partes conversam com uma interface genérica: `{ estado, acoes, meta }`. Trocar a origem do estado não toca nas partes.
4. **Suba o estado** para o ancestral comum quando irmãos precisam dele. Não sincronize por evento solto entre irmãos.
5. **Filhos em vez de "render props"** (`renderX`): aceite conteúdo já pronto e componha por fora.
6. **Variantes explícitas em vez de modos:** `FormularioEdicao` e `FormularioCriacao` compartilham as partes, não um `modo="edicao"` com `if` por dentro.

## Como aplicar neste repositório

- Reaproveitável entre telas → `components/`. Só vira componente quando há dois usos reais.
- Marcação pura, sem DOM → `templates/` com a tag `html` (escapa tudo); a view só joga num `innerHTML`.
- Antes de adicionar um parâmetro booleano a um componente existente, pergunte: isso é uma variante? Então crie a variante.

## Se um dia for React (confirmar com o usuário)

- Sem `forwardRef`; use `use()` no lugar de `useContext()` (React 19).
- Regras detalhadas de referência: `architecture-avoid-boolean-props`, `architecture-compound-components`, `state-decouple-implementation`, `state-context-interface`, `state-lift-state`, `patterns-explicit-variants`, `patterns-children-over-render-props`.
