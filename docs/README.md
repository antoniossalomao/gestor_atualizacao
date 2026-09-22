# Documentação do painel

Esta pasta guarda os quatro documentos **longos e detalhados** do painel web.
O que é curto e muda junto com o código mora na raiz do repositório
(`README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`) —
inclusive porque GitHub e o Claude Code reconhecem esses nomes e locais
automaticamente; misturá-los aqui dentro quebraria essa integração.

## O que tem aqui

| Arquivo | O que é | Quando você quer isto |
|---|---|---|
| [`DOCUMENTACAO_CONSOLIDADA.md`](DOCUMENTACAO_CONSOLIDADA.md) | Documento único: resumo executivo, arquitetura do painel web, arquitetura do agente C#, decisões de arquitetura (ADRs) e como verificar tudo | Você chegou agora e quer ler (ou apresentar) o projeto inteiro, de qualquer ângulo |
| [`MELHORIAS.md`](MELHORIAS.md) | O que já foi entregue e o que ainda falta, reconciliado contra o código | Você quer saber o que priorizar a seguir |
| [`OPERACAO.md`](OPERACAO.md) | Runbook, organizado **por sintoma** | Deu problema **agora** e você precisa resolver |

Três arquivos, não quatro — o índice que você está lendo é o quarto.

## Qual documento responde o quê

O risco de ter documentação demais é ela discordar de si mesma. A regra de
precedência, quando dois documentos divergirem:

| Assunto | Fonte da verdade |
|---|---|
| Como rodar, instalar, o que o sistema faz | [`../README.md`](../README.md) |
| Onde colocar cada coisa, como testar, o que não quebrar | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) |
| O que protege o quê, e os limites assumidos | [`../SECURITY.md`](../SECURITY.md) |
| **Por que** foi feito assim (painel web) | [Seção 4 de `DOCUMENTACAO_CONSOLIDADA.md`](DOCUMENTACAO_CONSOLIDADA.md#4-decisões-de-arquitetura--adrs-do-painel-web) |
| O que mudou, e quando | [`../CHANGELOG.md`](../CHANGELOG.md) |
| O que ainda falta fazer | [`MELHORIAS.md`](MELHORIAS.md) |
| O que fazer quando quebra | [`OPERACAO.md`](OPERACAO.md) |
| O que ainda pode dar errado no agente | [`../../atualizador/RISCOS-CONHECIDOS.md`](../../atualizador/RISCOS-CONHECIDOS.md) |
| Por que o agente C# foi feito assim | `atualizador/docs/adr/` (repositório do agente, não coberto por este índice) |

`DOCUMENTACAO_CONSOLIDADA.md` tem uma seção 0 (resumo executivo) que é uma
**fotografia**, útil para ler ou copiar inteira, mas que envelhece mais
rápido que o resto — porque descreve, em linguagem de negócio, o que as
seções técnicas abaixo dela também descrevem. Em caso de dúvida, a seção
técnica vence.

## Histórico desta pasta

Já passou por duas rodadas de consolidação: 09/09/2026 (nove documentos
soltos viraram `DOCUMENTACAO_CONSOLIDADA.md`) e 22/09/2026 (dois relatórios
de melhorias que discordavam entre si viraram `MELHORIAS.md`; a apresentação
executiva e os sete ADRs foram incorporados a `DOCUMENTACAO_CONSOLIDADA.md`).
Detalhe de cada rodada na [seção 7 de `DOCUMENTACAO_CONSOLIDADA.md`](DOCUMENTACAO_CONSOLIDADA.md#7-histórico-deste-documento-o-que-foi-consolidado).
Se esta pasta voltar a acumular arquivo solto, é sinal de que chegou a hora
da próxima rodada.
