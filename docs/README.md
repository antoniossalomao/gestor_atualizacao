# Documentação do painel

Esta pasta guarda os documentos **longos**. O que é curto e muda junto com o
código mora na raiz do repositório (`README.md`, `CONTRIBUTING.md`,
`SECURITY.md`, `CHANGELOG.md`).

## O que tem aqui

| Arquivo | O que é | Quando você quer isto |
|---|---|---|
| [`OPERACAO.md`](OPERACAO.md) | Runbook, organizado **por sintoma** | Deu problema **agora** e você precisa resolver |
| [`adr/`](adr/) | Decisões de arquitetura, uma por arquivo | *"Por que foi feito assim, e não do jeito óbvio?"* |
| [`DOCUMENTACAO_CONSOLIDADA.md`](DOCUMENTACAO_CONSOLIDADA.md) | Visão completa dos dois lados num arquivo só | Você chegou agora e quer ler tudo de uma vez |
| [`APRESENTACAO_EXECUTIVA_ATUALIZACAO_ERP.md`](APRESENTACAO_EXECUTIVA_ATUALIZACAO_ERP.md) | O projeto sem detalhe técnico | Você vai apresentar para a diretoria |
| `gerar-pdf.js`, `gerar-apresentacao-pdf.js` | Geradores dos PDFs ao lado dos `.md` | Você mudou um `.md` e precisa atualizar o PDF |

## Os PDFs

São **gerados**, nunca editados à mão:

```bash
cd web/docs
npm install
npm run pdf          # DOCUMENTACAO_CONSOLIDADA.pdf
```

Não usam Puppeteer: o Edge (ou Chrome) que já existe em qualquer Windows
imprime PDF pela linha de comando. Uma dependência de ~300 MB para converter um
arquivo de texto seria desproporcional.

> Mudou o `.md` e não regerou o PDF? Em dois dias os dois se contradizem em
> silêncio — foi exatamente o que aconteceu em set/2026, quando o gerador
> anterior foi apagado e o PDF virou uma foto que ninguém conseguia atualizar.

## Qual documento responde o quê

O risco de ter documentação demais é ela discordar de si mesma. A regra de
precedência, quando dois documentos divergirem:

| Assunto | Fonte da verdade |
|---|---|
| Como rodar, instalar, o que o sistema faz | [`../README.md`](../README.md) |
| Onde colocar cada coisa, como testar, o que não quebrar | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) |
| O que protege o quê, e os limites assumidos | [`../SECURITY.md`](../SECURITY.md) |
| **Por que** foi feito assim | [`adr/`](adr/) |
| O que mudou, e quando | [`../CHANGELOG.md`](../CHANGELOG.md) |
| O que fazer quando quebra | [`OPERACAO.md`](OPERACAO.md) |
| O que ainda pode dar errado no agente | [`../../atualizador/RISCOS-CONHECIDOS.md`](../../atualizador/RISCOS-CONHECIDOS.md) |

`DOCUMENTACAO_CONSOLIDADA.md` é uma **fotografia**: útil para ler inteiro, mas
é o documento que envelhece mais rápido, porque tudo nele está descrito também
em algum lugar que muda junto com o código. Ele perde de qualquer um da tabela
acima.
