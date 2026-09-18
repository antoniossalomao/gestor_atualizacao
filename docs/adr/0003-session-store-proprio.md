# ADR-0003 — Armazenamento de sessão escrito à mão

**Situação:** Aceita

## Contexto

`express-session` guarda sessões em memória por padrão, o que significa que
**todo mundo é deslogado a cada reinício do servidor** — inaceitável para um
app que roda como serviço do Windows e reinicia em toda atualização.

A escolha natural seria `connect-sqlite3`, que faz exatamente isso.

## Decisão

Escrever `src/database/SqliteSessionStore.js`: uma classe que estende
`session.Store` e implementa `get`, `set`, `destroy`, `touch` e `clearAll`
sobre um `sessions.sqlite` próprio, usando o `better-sqlite3` que o app já usa.

## Consequências

**Ganhos**
- Nenhuma dependência nova. `connect-sqlite3` traria o driver `sqlite3` (e sua
  cadeia de build via node-gyp) de volta ao projeto, justamente o que o
  [ADR-0002](0002-sqlite-com-better-sqlite3.md) evitou.
- Sendo síncrono, `set()` termina de gravar **antes** de responder. Não existe
  a corrida clássica de "logar e a requisição seguinte chegar antes da sessão
  ser persistida".
- `clearAll()` — invalidar todas as sessões após restaurar um backup do banco —
  é uma necessidade específica deste app, que um pacote genérico não teria.
- Arquivo separado do `gestao.db`: restaurar um backup de dados não restaura
  sessões antigas junto.

**Custos aceitos**
- É código nosso para manter. Mitigado por ser pequeno (~110 linhas) e pela
  interface de `session.Store` ser mínima e estável.
- Limpeza de sessões expiradas roda na subida do servidor, não por um timer.
  Num servidor que fica meses no ar, o arquivo cresce com sessões vencidas até
  o próximo reinício. Aceito: são linhas de texto curtas.

## Alternativas consideradas

- **`connect-sqlite3`** — descartado pela cadeia de dependências (ver acima).
- **`connect-redis`** — descartado: exigiria instalar e manter um Redis para
  guardar algumas dezenas de sessões.
- **Sessão em JWT, sem estado no servidor** — descartado: deixaria de existir
  a capacidade de invalidar sessão do lado do servidor, que é justamente o que
  `clearAll()` precisa fazer depois de restaurar um backup.
