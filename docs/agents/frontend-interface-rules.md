# Front-end: regras de interface (Vercel Web Interface Guidelines + UI/UX Pro Max)

Fontes: [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) (via
[vercel-labs/agent-skills · web-design-guidelines](https://github.com/vercel-labs/agent-skills)),
[nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill).

Revisão de UI: leia o(s) arquivo(s), confira contra as regras abaixo e reporte `arquivo:linha - problema`, terso, sem preâmbulo. Para revisar contra a versão mais nova, busque
`https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.

## Prioridade (UI/UX Pro Max): resolva de cima para baixo

1. Acessibilidade (crítico) · 2. Interação por mouse e teclado (crítico) · 3. Performance · 4. Estilo consistente · 5. Layout desktop · 6. Tipografia e cor · 7. Animação · 8. Formulários e feedback · 9. Navegação · 10. Gráficos e dados.

Escopo: **somente desktop** (largura mínima 1280 px). Não se aplicam regras de celular ou tablet (toque, safe-area, breakpoints pequenos).

## Acessibilidade

- Botão só de ícone: `aria-label`. Ícone decorativo: `aria-hidden="true"`.
- Todo controle de formulário com `<label>` (clicável) ou `aria-label`.
- `<button>` para ação, `<a>` para navegação. Nunca `<div onclick>`. HTML semântico antes de ARIA.
- Imagem com `alt` (`alt=""` se decorativa). Título `h1`–`h6` em ordem; link "pular para o conteúdo".
- Atualização assíncrona (toast, validação): `aria-live="polite"`.
- Contraste ≥ 4,5:1; informação nunca só por cor.

## Foco

- Todo interativo com foco visível. Nunca `outline: none` sem substituto. Use `:focus-visible`; `:focus-within` em controles compostos.
- Cabeçalho/rodapé/overlay fixo não pode cobrir o elemento focado.

## Formulários

- `autocomplete` e `name` úteis; `type`/`inputmode` corretos; nunca bloquear colar.
- Erro inline junto do campo; ao enviar, foco no primeiro erro. Botão de enviar ativo até a requisição começar, com spinner durante.
- Placeholder termina com `…` e mostra exemplo. Aviso antes de sair com alterações não salvas.
- Ação destrutiva: confirmação ou janela de desfazer, nunca imediata.

## Animação

- Respeitar `prefers-reduced-motion`. Animar só `transform`/`opacity`. Nunca `transition: all`; liste as propriedades. Animações interrompíveis.
- Durações por contexto (100–300 ms na maioria), não uma duração para tudo.

## Tipografia e conteúdo

- `…` e aspas curvas; espaço não separável (`10&nbsp;MB`); `tabular-nums` em colunas numéricas; `text-wrap: balance` em títulos.
- Texto longo: `truncate`/`line-clamp`/`break-words`; filhos de flex com `min-width: 0`. Trate estado vazio. Espere entradas curtas, médias e muito longas.
- Datas e números com `Intl.DateTimeFormat` / `Intl.NumberFormat`. Nomes de marca e código com `translate="no"`.
- Voz ativa, rótulo específico ("Salvar chave de API", não "Continuar"), erro com o próximo passo.

## Imagens, performance e layout

- `<img>` com `width` e `height`; abaixo da dobra `loading="lazy"`; crítica acima da dobra `fetchpriority="high"`. CLS < 0,1.
- Listas > 50 itens: virtualizar ou `content-visibility: auto`. Sem leitura de layout (`getBoundingClientRect`, `offsetHeight`) em laço; agrupe leituras e escritas do DOM.
- Fonte crítica com `preload` e `font-display: swap`. Preferir vídeo mudo em loop a GIF.
- Sem scroll horizontal a partir de 1280 px, nunca `user-scalable=no`. Corpo ≥ 16px, entrelinha ≈ 1,5. Zoom do navegador até 200% sem perder conteúdo.
- `overscroll-behavior: contain` em modal e gaveta.

## Estado e navegação

- A URL reflete o estado (filtro, aba, página, painel aberto). Links reais (Ctrl/Cmd+clique funciona). Voltar previsível.
- Gesto (arrastar, deslizar) sempre com alternativa de clique e de teclado.

## Tema

- `color-scheme: dark` no `<html>` em tema escuro; `<meta name="theme-color">` igual ao fundo; `<select>` nativo com `background-color` e `color` explícitos.
- Tokens semânticos de cor, nunca hex cru em componente. Teste claro **e** escuro.

## Anti-padrões (sinalize sempre)

`user-scalable=no` · `onpaste` com `preventDefault` · `transition: all` · `outline: none` sem foco substituto · `<div>`/`<span>` com clique · imagem sem dimensões · `.map()` gigante sem virtualização · input sem label · botão de ícone sem `aria-label` · formato de data/número fixo no código · `autofocus` sem motivo · GIF animado · ação só por gesto · emoji como ícone.
