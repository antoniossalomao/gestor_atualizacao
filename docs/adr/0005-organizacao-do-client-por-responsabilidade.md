# ADR-0005 — `client/js/` dividido por responsabilidade

**Situação:** Aceita

## Contexto

O front-end cresceu com duas pastas: `js/views/` (uma tela por arquivo) e
`js/core/` ("o resto"). `core/` chegou a **35 arquivos** misturando cinco
coisas diferentes:

- utilidades genéricas (`date.js`, `html.js`, `debounce.js`, `color.js`);
- vocabulário do negócio (`agenteStatus.js`, `relatorio.js`, `pessoa.js`);
- componentes de UI (`Modal.js`, `Toast.js`, `SortableTable.js`);
- gráficos em SVG (`BarChart.js`, `LineChart.js`, `PieChart.js`);
- o esqueleto do app (`App.js`, `router.js`, `prefs.js`, `theme.js`);
- e uma tela inteira de 1222 linhas (`ConfiguracoesPanel.js`) que, por
  tamanho e função, era uma `view`.

A pasta funcionava, mas não respondia à pergunta que mais importa no dia a dia:
*"onde eu ponho este arquivo novo?"*. A resposta era sempre "em `core/`", que é
o mesmo que não ter resposta.

## Decisão

Substituir `core/` por quatro pastas com um critério verificável cada, e mover
`ConfiguracoesPanel.js` para `views/`, onde estão os outros painéis:

| Pasta | Critério | Pode importar |
|---|---|---|
| `utils/` | não conhece o negócio | nada do projeto |
| `domain/` | conhece o negócio, **não toca no DOM** | `utils/` |
| `components/` | UI que não sabe em que tela está | `utils/`, `domain/` |
| `views/` | uma tela | tudo |
| `app/` | o esqueleto que segura o resto | tudo |

`components/charts/` agrupa os três gráficos SVG, que são componentes de uma
família só.

## Consequências

**Ganhos**
- A pergunta "onde ponho isso?" tem resposta mecânica: *precisa do DOM? fala de
  cliente/atualização/agente? é reaproveitável entre telas?*
- `domain/` não tocar no DOM é o que permite testá-lo no Node sem navegador —
  e é exatamente onde mora a lógica que erra em silêncio (classificação de
  retorno de agente, montagem de relatório). É a contrapartida direta de não
  ter compilador ([ADR-0001](0001-sem-framework-e-sem-build.md)).
- A direção das importações vira uma regra legível: o fluxo é
  `utils → domain → components → views`, e uma violação salta aos olhos na
  revisão.

**Custos aceitos**
- A migração reescreveu **175 caminhos de importação** em 32 arquivos. Feita
  por script, com o grafo de módulos inteiro (55 módulos) linkado depois para
  garantir que todo import resolvesse e todo nome importado existisse de fato.
- Caminhos ficaram um pouco mais longos (`../components/Modal.js` em vez de
  `./Modal.js`).
- Links para arquivos antigos, em anotações fora do repositório, quebraram.

**Efeito colateral valioso:** a migração revelou um bug real. Um caminho de
asset inexistente (`/js/core/App.js`, depois da mudança) respondia **200 com o
`index.html`**, porque o fallback de SPA capturava qualquer caminho fora de
`/api`. O navegador só reclamava depois, com "expected a JavaScript module
script but the server responded with a MIME type of text/html" — mensagem que
manda procurar no lugar errado. Corrigido em `Server.js` e
`middlewares/notFoundHandler.js`, com teste de regressão em
`tests/routing.test.js`.

## Alternativas consideradas

- **Manter `core/` e só criar subpastas dentro dela** — descartado: manteria o
  nome que não significa nada, só empurrando o problema um nível abaixo.
- **Organizar por funcionalidade** (`clientes/`, `atualizacoes/`, cada uma com
  sua view, seus componentes e seus helpers) — descartado: é a divisão certa
  quando os módulos são independentes, mas aqui quase todo componente é usado
  por quase toda tela. Levaria a uma pasta `compartilhado/` que seria a
  `core/` de volta, com outro nome.
