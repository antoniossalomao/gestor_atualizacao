# Front-end: acessibilidade (WCAG)

Fonte: [accesslint/claude-marketplace](https://github.com/accesslint/claude-marketplace) (skills `accessibility-scan`, `-inspect`, `-audit`, `-fix`, `-diff`).
Complementa `frontend-interface-rules.md`.

## Ciclo de correção: baseline → editar → verificar

1. **Baseline.** Audite a tela (ver "Ferramenta") e anote cada violação (regra + seletor). Se já recebeu uma lista de problemas, pule.
2. **Aplicar.** Para cada violação:
   - Abra o arquivo que gera aquele seletor. Sem indicação, procure por `data-testid`, `id`, `aria-label`, depois texto visível, depois posição na árvore.
   - Correção mecânica (atributo, label, contraste): aplique. Correção contextual ou visual (texto alternativo, texto de link, rótulo): deixe um `TODO` com o ID da regra. **Nunca invente conteúdo** (alt, rótulo, texto de link).
   - Agrupe edições do mesmo arquivo. Confirme com o usuário antes de editar fora do alvo óbvio ou de passar de ~10 correções mecânicas.
3. **Verificar.** Rode a mesma auditoria e compare: todas as violações alvo sumiram e nenhuma nova apareceu. Se apareceu uma nova ou sobrou uma, reporte e pare. Não itere em silêncio.

## Escopo

- Uma página, automático: scan. Uma página, manual (teclado, leitor de tela, foco): inspect. Site inteiro (WCAG-EM): audit. Regressão entre duas versões: diff.
- Não varra o código inteiro sem pedido.
- O DOM ao vivo revela o que o código-fonte não mostra; prefira auditar a tela aberta no navegador.

## Ferramenta

AccessLint expõe `audit_live` (URL, DOM ao vivo) e `audit_html` (HTML/arquivo). É um plugin/MCP do Claude Code:

```bash
claude plugin marketplace add accesslint/claude-marketplace
claude plugin install accesslint
```

Sem a ferramenta instalada, faça a revisão manual com `frontend-interface-rules.md` e abra a tela nos dois temas. **Instalar plugin é decisão do usuário: pergunte antes.**

## Verificações manuais que a automação não pega

- Percorrer toda a tela só com teclado: ordem do foco, foco visível, sem armadilha, foco volta ao disparador ao fechar modal/gaveta/formulário.
- Modal aberto: o conteúdo de trás fica inerte.
- Zoom 200% sem perda de conteúdo; contraste nos dois temas; movimento reduzido respeitado.
- Mensagens de erro e toasts anunciados (`aria-live`).
