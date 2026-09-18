# ADR-0002 — SQLite embarcado, com driver síncrono

**Situação:** Aceita

## Contexto

O painel substituiu um aplicativo Python/Tkinter que já guardava tudo num
`gestao.db` SQLite. Os dados precisavam continuar funcionando sem migração.

O uso é de uma equipe pequena: dezenas de milhares de linhas, poucos usuários
simultâneos, escrita esporádica. Não há requisito de alta concorrência de
escrita nem de replicação.

## Decisão

Continuar com **SQLite**, acessado por **`better-sqlite3`** — um driver
**síncrono**.

O schema é criado e evoluído em código, por `src/database/Database.js`, na
subida do servidor. Não há ferramenta de migração externa.

## Consequências

**Ganhos**
- O banco do app antigo continuou valendo: zero migração de dados.
- `better-sqlite3` distribui binário pré-compilado — `npm install` no Windows
  não precisa de compilador C++ (ao contrário do driver `sqlite3`).
- Sendo síncrono, o código de repositório é linear: sem `async`/`await` nem
  callback para ler uma linha. Isso elimina uma classe inteira de bugs de
  ordem de execução, e é o que torna o `SqliteSessionStore` seguro
  (ver [ADR-0003](0003-session-store-proprio.md)).
- Backup é copiar um arquivo. É literalmente o que `BackupService` faz.

**Custos aceitos**
- **Uma consulta lenta trava o event loop do Node inteiro.** Com este volume,
  cada consulta custa menos de um milissegundo; se o volume crescer muito, esta
  é a primeira premissa a revisar.
- Um servidor só. Não dá para escalar horizontalmente sem trocar o banco.
- Escrita é serializada pelo SQLite. Irrelevante para este padrão de uso.

**Mitigação em uso:** `journal_mode = WAL`, que permite leituras concorrentes
durante uma escrita.

## Alternativas consideradas

- **PostgreSQL** — descartado: exigiria migrar os dados existentes, instalar e
  manter um serviço a mais no servidor da empresa, e resolver um problema de
  concorrência que não existe aqui.
- **Driver `sqlite3` (assíncrono)** — descartado: depende de compilação via
  node-gyp no Windows, e sua cadeia de dependências de build tinha
  vulnerabilidades conhecidas à época. O ganho (não bloquear o event loop) não
  se paga neste volume.
