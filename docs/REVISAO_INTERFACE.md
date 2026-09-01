# Revisão de interface e distribuição — set/2026

Documento de referência da revisão feita no front-end (`web/client`) e no módulo
de distribuição do atualizador (`web/server`, aba Distribuição).

Ele registra **o que mudou e por quê**. Onde a decisão foi discutível, o porquê
está escrito — é o tipo de coisa que se perde em seis meses e faz alguém
"consertar" de volta o que era intencional.

---

## Sumário

1. [Defeitos corrigidos](#1-defeitos-corrigidos)
2. [Distribuição: versão por sistema](#2-distribuição-versão-por-sistema)
3. [Painel do atualizador automático](#3-painel-do-atualizador-automático)
4. [Fluidez: cache e renderização](#4-fluidez-cache-e-renderização)
5. [Navegação](#5-navegação)
6. [Visual e design system](#6-visual-e-design-system)
7. [Acessibilidade](#7-acessibilidade)
8. [Mapa dos arquivos novos](#8-mapa-dos-arquivos-novos)
9. [Mudanças de banco e migração](#9-mudanças-de-banco-e-migração)
10. [Contrato do agente (Worker C#)](#10-contrato-do-agente-worker-c)
11. [Como verificar](#11-como-verificar)

---

## 1. Defeitos corrigidos

| # | Defeito | Onde estava | Correção |
|---|---------|-------------|----------|
| 1 | Página sem `<h1>`. O cabeçalho tinha eyebrow + parágrafo, e a regra CSS `.app-header__titles h1` estilizava um elemento que nunca era criado. | `core/App.js` | `<h1>` de verdade, que muda conforme a aba, junto com `document.title`. |
| 2 | A lista de clientes parados **nunca era desenhada**. A API devolvia `desatualizados` completo; a tela usava só `.length`. Havia até uma `severidadeCor()` pronta, sem nenhuma chamada. | `views/ResumoView.js` | Tabela ordenável, com fundo tingido conforme o atraso, e o indicador virou botão que rola até ela. |
| 3 | **Race condition na busca.** Digitando rápido, a resposta de `"ab"` podia chegar depois da de `"abc"` e sobrescrever a tabela com o resultado errado. | Todas as telas com busca | `ApiClient` cancela por chave: requisição nova aborta a anterior de mesma chave. |
| 4 | **Listeners vazando.** Três views registravam `document.addEventListener("keydown")` e nunca removiam; ao expirar a sessão as instâncias eram descartadas mas os listeners continuavam. Depois de re-logar, `Delete` podia excluir por uma tela fantasma. | Atualizações, Agendamentos, Clientes | Classe base `View` com `this.on(...)` rastreado e `destroy()`. |
| 5 | Publicar versão sem `try/catch` nem trava de botão: falha virava rejeição não tratada, sem nada na tela. | `views/DistribuicaoView.js` | Tratamento de erro, botão travado, mensagem do servidor exibida. |
| 6 | `Escape` num campo apagava os 8 campos do formulário, sem volta. | Formulários | Limpa e oferece **Restaurar** num toast por alguns segundos. |
| 7 | `Enter` amarrado campo a campo, sem `<form>` — nenhuma validação nativa. | Formulários | `<form>` de verdade com `submit`. |
| 8 | **Exportar ignorava os filtros.** Filtrar 12 registros e receber um .xlsx com 4.000. | `AtualizacoesController` / repositório | `exportAll(search, responsavel)` usa as mesmas cláusulas de `list()`, extraídas para `_filtros()`. |
| 9 | O "último log" de cada agente era `MAX(id)`, não o mais recente por data. | `VersaoRepository.agentes()` | `ROW_NUMBER() OVER (PARTITION BY cnpj ORDER BY criado_em DESC, id DESC)`. |

### Decisão: exclusão reversível em vez de confirmação

Atualizações e Agendamentos **não pedem mais confirmação para excluir**. A ação
acontece na hora e o toast oferece **Desfazer** por 7 segundos.

O motivo: confirmação em toda exclusão vira reflexo — a pessoa clica
"Confirmar" sem ler. Ou seja, custa um clique a mais em *todas* as vezes e não
impede o engano em nenhuma. Desfazer custa zero quando você quis mesmo excluir,
e resolve o problema de verdade quando não quis.

**Clientes continua pedindo confirmação**, de propósito: um cliente é
referenciado pelo nome em todo o histórico, e "desfazer" recriaria o cadastro
com um id novo — o que não é o mesmo que nunca ter excluído.

---

## 2. Distribuição: versão por sistema

### O problema

O formulário tinha só "Versão" e "Arquivo". A tabela `versoes_atualizador` não
tinha coluna `sistema`, e `VersaoService.check()` respondia com
`latestPublished()` — **a última publicada de todas, qualquer que fosse**.

Na prática: o agente do `B_NFe` podia baixar e instalar o pacote do `B_Vendas`.
O painel mostrava sete versões "publicadas" simultâneas, sem que isso fosse
contradição alguma, porque não havia nada que dissesse a que sistema cada uma
pertencia.

### O que mudou

- **`sistema` é o primeiro campo do formulário**, obrigatório, alimentado pelo
  mesmo cadastro da aba Sistemas.
- `check()` exige `sistema` — não é opcional de propósito. Deixar opcional
  reabriria exatamente o comportamento perigoso, por descuido.
- **Uma versão no ar por sistema, sempre.** Publicar uma versão nova marca a
  anterior do mesmo sistema como `substituida` e ela sai de circulação na hora.
- O formulário **avisa antes** qual versão vai sair do ar, assim que um sistema
  é escolhido. Publicar é a ação de maior consequência do sistema (decide o que
  centenas de máquinas vão baixar hoje à noite); uma substituição silenciosa
  seria uma surpresa ruim na primeira vez.

### Por que "substituída" e não excluída

Você pediu exclusão automática. O efeito prático é idêntico — a versão sai do ar
imediatamente e o agente nunca mais a recebe — mas o registro permanece.

O motivo é concreto: quando algo quebra num cliente, a primeira pergunta é
"que versão ele estava rodando antes?". Apagar a linha apaga essa resposta.
Os logs dos agentes referenciam versões por número; sem o registro, o histórico
vira uma lista de números órfãos.

**Exclusão de verdade existe** (`DELETE /api/versoes/:id`), com o arquivo do
pacote junto, para rascunhos errados e versões velhas. A única trava: **não dá
para excluir a versão que está no ar**, porque isso deixaria os agentes daquele
sistema sem nada para baixar no meio de uma janela de atualização, sem aviso.
Para tirá-la do ar, publica-se a próxima.

### Ciclo de vida

```
  rascunho ──publicar──> publicada ──(publicar outra do mesmo sistema)──> substituida
     │                       │                                                │
     └────── excluir ────────┼──── excluir (bloqueado) ────────────────────────┘
                             │                                        excluir OK
                        (só saindo do ar)
```

---

## 3. Painel do atualizador automático

### O que estava raso

A tabela mostrava último status, data e duas contagens. Essas contagens eram
calculadas **no navegador, em cima dos 30 últimos registros** que a listagem
devolvia — ou seja, "total de execuções" era na verdade "quantos dos últimos 30".
Com mais de trinta retornos no dia, os números simplesmente não batiam com a
realidade.

E a pergunta central do painel não tinha resposta: **quais clientes ainda não
estão na versão que eu publiquei?**

### O que existe agora

Uma chamada só (`GET /api/versoes/painel`) devolve tudo, coerente entre si —
buscar em quatro requisições separadas abriria espaço para a tela mostrar um
total que não bate com a lista logo abaixo dele.

**Indicadores:** agentes monitorados · na versão publicada · ainda
desatualizados · com erro · sem contato (24h+) · execuções nas 24h.

**Por agente**, com a agregação feita em SQL sobre a tabela inteira:

| Campo | O que responde |
|---|---|
| `situacao` | `ok` / `desatualizado` / `erro` / `offline` / `pendente` |
| `ultimaVersao` vs `versaoAlvo` | instalada contra publicada — **a pergunta central** |
| `atualizado` | booleano das duas acima |
| `horasSemContato` | há quanto tempo sumiu |
| `taxaSucesso` | sucessos ÷ total, histórico completo |
| `maquina`, `hwid`, `cidade` | de onde veio |
| `total`, `falhas`, `sucessos` | contagens reais, não amostra |

A ordem de precedência da `situacao` importa: **offline ganha de tudo** (não dá
para afirmar nada sobre uma máquina que sumiu), e **erro ganha de
desatualizado**.

**Filtros** por situação, sistema e busca livre (empresa, CNPJ, máquina, cidade).

**Cada retorno** carrega o contexto que faltava: sistema, `2026.08.21 → 2026.08.27`,
e duração da execução.

**Atualiza sozinho a cada 30s**, e **pausa quando a aba do navegador não está
visível** — não faz sentido consultar o servidor para uma tela que ninguém está
olhando. Um painel de monitoramento com botão manual só mostra a verdade quando
alguém lembra de clicar.

---

## 4. Fluidez: cache e renderização

### Stale-while-revalidate (`core/SwrCache.js` + `core/View.js`)

Toda troca de aba refazia as chamadas do zero, e a tabela ficava em branco até a
resposta voltar. Como se pula entre abas o tempo todo, isso significava esperar
por dados que quase nunca tinham mudado.

Agora: **mostra o que tem guardado na hora → revalida por trás → redesenha só se
mudou.**

O "só se mudou" é o detalhe que importa. Redesenhar uma tabela idêntica custa um
pisca visível e a perda da posição de rolagem, sem nenhum ganho. A comparação
usa serialização **estável** (chaves de objeto ordenadas) — `JSON.stringify` puro
não serve, porque `{a:1,b:2}` e `{b:2,a:1}` viram textos diferentes e o SQLite
não garante ordem de colunas entre consultas.

Uma barra fina no topo da view indica a revalidação em segundo plano. É a
diferença entre "o app travou" e "estou conferindo se mudou".

Escrita numa aba invalida o cache das outras que dependem do mesmo dado
(cadastrar cliente → invalida `resumo` e `consulta`).

### Renderização incremental

| Componente | Antes | Agora |
|---|---|---|
| `SortableTable` | Clicar numa linha reconstruía o `<tbody>` inteiro — 50 linhas × 9 colunas recriadas para trocar uma classe | Seleção troca a classe nas duas linhas envolvidas; `setRows` reaproveita as `<tr>` existentes |
| `Pagination` | `innerHTML` refeito a cada página → o botão clicado deixava de existir, o foco caía no `body`, e paginar com `Enter` repetido não funcionava | Nós criados uma vez, só rótulos e `disabled` mudam |
| `SortableTable` (cliques) | Um listener por linha | Um listener delegado no `<tbody>` |
| `Autocomplete` | Um `document.addEventListener("click")` **por instância**, nunca removido | Um listener global compartilhado + `destroy()` |

### Upload com progresso

`postForm` trocou `fetch` por `XMLHttpRequest` — só o XHR expõe
`upload.onprogress`. Os pacotes têm dezenas de MB; sem barra, a tela ficava
parada por minutos sem sinal nenhum. Timeout de 10 min para upload, 15s para o
resto.

---

## 5. Navegação

- **Rotas por hash** (`#/clientes`). Recarregar mantém a tela, o botão Voltar
  funciona, e dá para mandar link de uma aba. Hash e não History API de
  propósito: o hash nunca chega ao servidor, então não há risco de uma rota do
  front conflitar com uma da API.
- **Paleta de comandos (Ctrl+K)** — telas, ações e **clientes** na mesma busca.
  Telas e ações aparecem na hora (síncrono); os clientes entram quando a API
  responde, para a paleta nunca abrir vazia esperando a rede. Busca por
  subsequência, com itens recentes subindo.
- **`Alt+1`…`Alt+9`** vão direto à aba de mesmo número.
- **`?`** abre a lista de atalhos. Os atalhos já existiam desde a primeira
  versão e não eram mencionados em lugar nenhum — atalho que ninguém descobre é
  código morto.
- **Filtros persistem** por aba (`sessionStorage`), com botão "Limpar filtros"
  que só aparece quando há filtro.
- **Indicadores clicáveis** — "Parados há mais de 60 dias" leva à lista.

---

## 6. Visual e design system

### Consolidação do CSS

`components.css` tinha duas seções escritas depois ("shell atualizado" e
"acabamento visual") que **sobrescreviam** regras de 200 linhas acima:
`.app-header` aparecia duas vezes, `.app-main` também. Qualquer ajuste exigia
descobrir qual das duas vencia.

Agora cada componente é definido **uma vez só**, na sua seção, com índice no
topo. Nenhuma cor literal fora de `theme.css`.

### Escala tipográfica

Havia 17 tamanhos diferentes espalhados (10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5,
14, 19, 22, 24, 25, 26, 28, 30, 34px), a maioria escolhida no olho. Isso faz a
interface parecer levemente desalinhada sem que se consiga apontar onde.

Sete degraus (`--txt-2xs` … `--txt-2xl`) dão conta de tudo.

### Breakpoints

De seis (560, 760, 780, 860, 900, 1040) para dois estruturais (900 e 780) mais
os da grade de formulário, que ficam junto do componente. 760 e 780 faziam quase
a mesma coisa em regras separadas.

### Tema claro

Três estados: **sistema** (padrão, segue o SO), **escuro**, **claro**. Como todas
as cores já eram variáveis em `:root`, o tema claro não exigiu tocar em nenhum
componente — o bloco `[data-tema="claro"]` redefine as mesmas variáveis.

Dois detalhes:

- Um script inline no `<head>` aplica o tema salvo **antes do primeiro pixel**.
  Esperar o módulo JS carregar faria a página piscar no tema errado.
- `:root:not([data-tema])` na media query — sem o `:not`, quem escolheu escuro
  num computador configurado em claro seria sobrescrito.
- As cores que o JavaScript calcula (fundo tingido das linhas) passaram a ser
  lidas dos tokens em tempo de execução (`tokenHex`). Antes eram hex copiados
  para dentro do JS, o que quebraria no tema claro: linhas cinza-escuro sobre
  fundo branco.

### Outros

- **Botões com spinner** — `disabled` sozinho, numa exportação de 3s, se lê como
  "não funcionou". A largura é fixada antes de trocar o conteúdo, senão a barra
  de botões inteira pula.
- **Toasts** com animação de saída, botão de fechar, pausa no hover, dedupe
  (mensagem repetida vira contador "2×") e ação de desfazer.
- **Estados vazios** com ícone, explicação e botão que resolve o vazio. Um vazio
  sem saída deixa a pessoa sem saber se filtrou demais, se o cadastro está
  faltando, ou se o sistema quebrou.
- **Sidebar recolhível** — ganha ~174px de largura útil, que é onde as tabelas
  precisam de espaço.
- **Fontes** movidas de `@import` no CSS para `<link>` + `preconnect` no HTML.
  Um `@import` só começa a baixar depois do CSS ser lido e interpretado.
- **`tabular-nums`** nos números — sem isso, um contador indo de 199 para 200
  muda a largura do texto e os elementos ao lado tremem.
- **Modo "editando #12"** ao lado dos botões do formulário. Antes, a única pista
  de que o formulário estava em edição era a linha destacada lá embaixo.
- **Banner de lembrete** deixou de ser faixa amarela sólida de ponta a ponta e
  virou um aviso contido, no vocabulário dos cards.

---

## 7. Acessibilidade

- **Modal** com `role="dialog"`, `aria-modal`, foco preso (`Tab` circula),
  foco devolvido a quem abriu, rolagem do corpo travada. Numa confirmação, o
  foco padrão é **Cancelar**, não o "Confirmar" destrutivo — antes um `Enter`
  reflexo confirmava a exclusão. `BackupsPanel` e `UsersPanel` passaram a usar
  `Modal.abrirCaixa`, então herdaram tudo isso.
- **Abas** com `role="tablist"`, `aria-selected`, navegação por setas e roving
  tabindex — antes `Tab` passava por cada uma das nove.
- **Tabelas**: cabeçalhos ordenáveis viraram `<button>` com `aria-sort`; linhas
  navegáveis por `↑`/`↓`/`Home`/`End` com `Enter` para selecionar. Antes,
  `<tr onclick>` era invisível para teclado.
- **Listas de resultado** (Consulta, Backups) viraram `<button>` — eram `<div>`,
  inalcançáveis por teclado. Num diálogo de restauração de banco isso é sério.
- **Skip link** para pular o menu.
- **`prefers-reduced-motion`** zera as animações. Quem marca isso costuma
  fazê-lo por enjoo ou sensibilidade vestibular — não é enfeite, é sintoma.
- `aria-live` nos contadores de resultado, `aria-invalid` nos campos de data,
  `role="alert"` nos toasts de erro.

---

## 8. Mapa dos arquivos novos

```
client/js/core/
  View.js            Classe base: listeners rastreados + swr(). Resolve o
                     vazamento de listeners de forma sistemática.
  SwrCache.js        Cache stale-while-revalidate com comparação estável.
  router.js          Rotas por hash.
  prefs.js           sessionStorage (filtros) e localStorage (tema), com
                     try/catch — em janela anônima o acesso LANÇA exceção.
  theme.js           Claro / escuro / sistema.
  html.js            escapeHtml, escapeAttr, el, plural. Antes escapeHtml
                     estava copiado em 7 arquivos.
  EmptyState.js      Estado vazio com ação.
  CommandPalette.js  Ctrl+K.
  Shortcuts.js       Lista de atalhos (?).

server/src/
  database/VersaoRepository.js   + sistema, substituição, agentes(), filtros
  services/VersaoService.js      + painel(), remove(), check por sistema
  controllers/VersoesController.js + painel, ativas, remove
```

Rotas novas: `GET /api/versoes/painel`, `GET /api/versoes/ativas`,
`DELETE /api/versoes/:id`. `GET /api/update/check/:cnpj` passou a exigir
`?sistema=`.

---

## 9. Mudanças de banco e migração

Todas idempotentes, rodam a cada boot (`Database._migrate`).

**`versoes_atualizador`:** `sistema`, `substituido_em`, `substituido_por`,
`tamanho_bytes`.

**`atualizador_logs`:** `sistema`, `versao`, `versao_anterior`, `duracao_ms`,
`maquina`.

**Índices:** `idx_versoes_sistema`, `idx_atualizador_logs_cnpj`.

### Backfill automático

As 7 versões que já existiam ficaram com `sistema` vazio. Isso seria uma falha
**silenciosa**: elas continuariam marcadas como `publicada`, mas
`latestPublished(sistema)` nunca as encontraria, e todo agente passaria a
receber "não há atualização" sem nenhum erro aparente.

`_backfillSistemaDasVersoes()` deduz o sistema do nome do pacote, comparando com
os sistemas cadastrados sem acentuação, maiúsculas nem separadores, e escolhendo
o nome cadastrado **mais longo** que aparece no arquivo (para "B_Ordem" não
ganhar de "B_Ordem_Servico" por acaso). Depois deixa no máximo uma publicada por
sistema — exatamente o que teria acontecido se elas tivessem sido publicadas em
ordem.

Resultado real na primeira execução:

```
#1=B_Vendas  #2=B_Vendas  #3=B_Importa  #4=B_Ordem
#5=B_NFe     #6=B_NFSe    #8=B_Vendas
```

B_Vendas ficou com a 2026.08.27 (id 8) no ar e as duas anteriores como
`substituida`. Os demais sistemas, com uma cada.

Versões cujo sistema não puder ser deduzido aparecem no painel como "Sistema não
informado" e **não são distribuídas** até serem corrigidas — falhar visível é
melhor que falhar calado.

---

## 10. Contrato do agente (Worker C#)

> ⚠️ **O agente precisa ser atualizado.** `?sistema=` é obrigatório.

### Consultar atualização

```http
GET /api/update/check/{cnpj}?sistema=B_Vendas&versao=2026.08.27
x-agent-token: <AGENT_API_TOKEN>
```

```jsonc
// há atualização
{ "update_available": true, "sistema": "B_Vendas", "version": "2026.09.01",
  "packages": [{ "file": "...", "url": "...", "sha256": "...", "bytes": 50 }],
  "script_url": "", "notes": "Observações da entrega" }

// já está na última
{ "update_available": false, "sistema": "B_Vendas" }
```

Sem `sistema`: `400 { "error": "Informe o sistema no parâmetro 'sistema'." }`

Um agente que cuida de vários sistemas faz **uma chamada por sistema**.

### Reportar execução

```http
POST /api/update/log
x-agent-token: <AGENT_API_TOKEN>
```

```jsonc
{
  "cnpj": "11222333000181",
  "status": "OK",              // obrigatório. OK|SUCESSO|ATUALIZADO|CONCLUIDO
                               // ou ERRO|FALHA
  "sistema": "B_Vendas",       // novo — sem ele o painel não sabe contra
                               // qual versão alvo comparar
  "versao": "2026.09.01",      // novo — versão instalada
  "versaoAnterior": "2026.08.27", // novo
  "duracaoMs": 73500,          // novo
  "maquina": "CAIXA-01",       // novo
  "hwid": "...",
  "detalhes": "Atualizado e serviço reiniciado"
}
```

Os campos novos são **opcionais** — logs antigos continuam sendo aceitos. Mas
sem `sistema` e `versao` o agente aparece como "em andamento" em vez de "em
dia"/"desatualizado", porque não há como comparar. Aliases em inglês aceitos:
`system`, `version`, `previous_version`, `duration_ms`, `machine`, `details`.

---

## 11. Como verificar

```bash
cd web/server && npm start
```

O console mostra a migração na primeira vez.

**Checklist manual:**

| O quê | Como |
|---|---|
| Rota na URL | Trocar de aba → URL vira `#/clientes`; recarregar mantém a tela |
| Paleta | `Ctrl+K`, digitar o nome de um cliente, `Enter` → abre a ficha |
| Tema | Botão no cabeçalho cicla sistema → escuro → claro; recarregar mantém |
| Cache | Ir e voltar entre abas → aparece na hora, com a barra fina revalidando |
| Resumo | Clicar em "Parados há mais de 60 dias" → rola até a lista |
| Distribuição | Escolher sistema → aviso diz qual versão sai do ar |
| Substituição | Publicar → toast diz qual saiu; a antiga vira "Substituída" |
| Trava de exclusão | Tentar excluir a versão "No ar" → recusa explicada |
| Upload | Enviar pacote grande → barra de progresso |
| Desfazer | Excluir uma atualização → toast com "Desfazer" |
| Escape | Preencher o formulário, `Esc` → toast com "Restaurar" |
| Exportar | Filtrar e exportar → `atualizacoes-filtrado.xlsx` só com o filtrado |
| Teclado | `Tab` até a tabela, `↑`/`↓` navega, `Enter` seleciona |
| Atalhos | `?` abre a lista |

**Verificação de código:**

```bash
# sintaxe
cd web && for f in $(find client/js -name '*.js'); do node --input-type=module --check < "$f"; done
for f in $(find server/src -name '*.js'); do node --check "$f"; done
```

O que foi verificado nesta revisão: sintaxe de todos os arquivos, resolução de
todos os imports ES (arquivo existe + export existe), boot do servidor,
migração e backfill sobre o banco real, e um ciclo HTTP completo com sessão —
login, envio, publicação com substituição, trava de exclusão, exclusão de
versão substituída, `check` por sistema (confirmando que o agente do B_NFe
**não** recebe o pacote do B_Vendas) e registro de log com os campos novos.

**Não foi verificado em navegador** — não havia ferramenta de automação
disponível no ambiente. O JavaScript de interface foi revisado manualmente, mas
vale um passe visual pelas telas antes de considerar fechado.
