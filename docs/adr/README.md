# Registros de Decisão de Arquitetura (ADR)

Um ADR é um documento curto que registra **uma** decisão de arquitetura: o que
foi decidido, em que contexto, o que se ganhou e o que se perdeu.

Existem porque o código mostra o resultado de uma decisão, nunca as
alternativas que foram descartadas. Sem isso, seis meses depois alguém "conserta"
uma escolha deliberada — e reintroduz o problema que ela evitava.

## Índice

| # | Decisão | Situação |
|---|---|---|
| [0001](0001-sem-framework-e-sem-build.md) | Front-end sem framework e sem etapa de build | Aceita |
| [0002](0002-sqlite-com-better-sqlite3.md) | SQLite embarcado, com driver síncrono | Aceita |
| [0003](0003-session-store-proprio.md) | Armazenamento de sessão escrito à mão | Aceita |
| [0004](0004-injecao-de-dependencia-manual.md) | Injeção de dependência na mão, sem container | Aceita |
| [0005](0005-organizacao-do-client-por-responsabilidade.md) | `client/js/` dividido por responsabilidade | Aceita |
| [0006](0006-verificacao-de-tipos-sem-build.md) | Verificação de tipos sem build, escopada ao código puro | Aceita |

## Como escrever um novo

Copie a estrutura de qualquer um: **Contexto → Decisão → Consequências →
Alternativas consideradas**. Numere em sequência. Um ADR não se edita depois de
aceito: se a decisão mudar, escreva um novo que o substitua e marque o antigo
como "Substituída pelo ADR-XXXX".

Registre uma decisão aqui quando ela for **cara de reverter** ou quando a
escolha óbvia tiver sido descartada por um motivo não óbvio. Escolha de nome de
variável não é ADR.
