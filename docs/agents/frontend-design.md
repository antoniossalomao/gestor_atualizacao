# Front-end: direção de design e anti-genérico

Fontes: [anthropics/skills · frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design),
[heydamir/unslop](https://github.com/heydamir/unslop) (CC BY 4.0, crédito: Damir Sokolovsky),
[bencium/bencium-claude-code-design-skill](https://github.com/bencium/bencium-claude-code-design-skill).

## Antes de desenhar

1. Identifique o assunto: o que é o produto, quem usa, qual o trabalho principal da tela. Se não estiver claro, proponha e confirme.
2. Escreva um plano curto: **cor** (4–6 hex nomeados), **tipografia** (1–2 famílias, papéis claros), **layout** (uma frase + wireframe ASCII), **princípios**.
3. Revise o plano contra o pedido. Trecho que sairia igual para qualquer produto parecido: refaça.
4. Só então escreva o código.

**Exceção para este projeto:** a identidade visual existente (paleta, fontes, tokens do CSS) é do usuário. Não troque cores, fontes ou o estilo geral sem perguntar. Mudança dentro da identidade atual: faça direto.

## Princípios

- Uma única coisa memorável por tela; o resto fica quieto e disciplinado. Corte decoração que não serve ao pedido.
- Tipografia carrega a personalidade. Escala clara, linhas de texto abaixo de 80 caracteres, serifa com entrelinha um pouco maior.
- Estrutura visual é informação: bordas, numeração, divisores e rótulos só quando codificam algo real. Numerar só o que é sequência.
- Movimento só quando responde a uma ação (abrir, expandir, confirmar). Nada de fade-and-slide em cada seção nem hover animado em todo card.
- Hierarquia por escala, peso e espaçamento, não por sombra. Botões mostram que clicam por cor, espaço e tipografia; cards usam borda de 1px ou troca de fundo.
- Paleta: 4–5 neutros levemente dessaturados + 1–3 acentos. Escala tipográfica matemática (ex.: 1,25×). Espaçamento em base 4px (4/8/16/24/32/48).
- Piso de qualidade sem alarde: responsivo até mobile, foco visível, `prefers-reduced-motion`, contraste AA.

## Sinais de "gerado por IA" (remova, não troque por outra tendência)

- Degradês roxo→azul, texto em degradê, brilhos (glow), sombras coloridas, blobs de cor, vidro com realce interno.
- Emoji como ícone, rótulo, status ou badge; `New ✨`, `PRO` por toda parte.
- Rótulos em CAIXA ALTA com tracking aberto; `A · B · C`; `PALAVRA — fragmento`; `→` em todo botão/link.
- Títulos peso 800/900; itálico para ênfase; destacar só uma palavra do título.
- Tudo em pílula; mesmo raio e mesma sombra em todos os cards; conteúdo picado em cards idênticos.
- Fundo creme + serifa + terracota; preto + um verde ácido; layout de jornal com filetes finos.
- Copy: saudação como título ("Bem-vindo de volta! 👋"), exclamações, palavras de hype (turbine, mágico, sem fricção), ponto final em rótulo de botão, dados falsos tipo `$123,456`.
- Espaçamento arbitrário (`13px`, `7px`): use a escala de 4px; itens iguais com tamanhos iguais; um padding por família de cards.

## Como corrigir (ordem fixa, uma camada por vez em toda a tela)

espaçamento → cor → ícones → copy → tipografia → layout → detalhes → visuais → movimento.

- **Cor:** uma rampa neutra com tom, três papéis de texto, um acento usado uma ou duas vezes por tela. Profundidade por degraus de superfície e filetes de 6–10% de opacidade.
- **Ícones:** um único conjunto, um tamanho, um traço, na cor do texto. Sem emoji na interface.
- **Tipografia:** pesos 400–600, sem caixa alta espaçada, sem tracking negativo em texto pequeno, números em um formato só com `tabular-nums`.
- **Raios:** raio aninhado soma (raio interno = externo − padding). Botões compartilham o raio de controle.
- **Movimento:** sem loop nem bounce, uma curva de easing, nunca animar propriedade de layout.
- Não renomeie o produto, não invente funcionalidade, claim ou dado, não mude a ordem das seções sem pedido.

## Checklist antes de entregar

- [ ] Valores de espaçamento na escala de 4px; coisas iguais com tamanhos iguais
- [ ] Ícones, rótulos e números alinhados em uma coluna
- [ ] Sem degradê de matiz, glow, sombra colorida, blob, emoji
- [ ] Um conjunto de ícones, um tamanho, um traço
- [ ] Sem exclamação, sem ponto final em texto curto, sem saudação como título
- [ ] Estados de linha de tabela distinguíveis: cabeçalho, valor em uso, seleção, foco de teclado
- [ ] Teste do template: trocando o nome do produto por outro, a tela ainda serviria? Se sim, aprofunde a identidade
