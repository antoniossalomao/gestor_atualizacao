# Back-end: Node.js, API, segurança, banco e performance

Fontes: [wshobson/agents](https://github.com/wshobson/agents) (`nodejs-backend-patterns`, `api-design-principles`,
`sql-optimization-patterns`, `database-migration`), [goldbergyoni/nodebestpractices](https://github.com/goldbergyoni/nodebestpractices)
(segurança, erros, performance). Adaptado à stack deste projeto: **Node ≥ 20.6, Express 5, better-sqlite3, CommonJS**.
Exemplos longos ficam nos repositórios de origem; aqui só as regras.

## Estrutura e config

- `routes/ → controllers/ → services/ → database/`. Cada camada só conhece a de baixo. SQL só em `database/`.
- Injeção de dependência simples (passe o banco/serviço como argumento) para testar sem mock de banco.
- Config por ambiente, validada na subida (falhe cedo se faltar). Segredo nunca no código nem no repositório. Regra da equipe vai em `regrasEquipe.js` (ver CLAUDE.md).
- Desligamento limpo (`SIGTERM`/`SIGINT`): parar de aceitar conexões, terminar requisições, fechar o banco. Endpoint de saúde (`/health`).
- Log estruturado (Pino ou equivalente), sem dados pessoais ou segredos. `console.log` solto não entra.

## Erros

- Só o objeto `Error` (ou subclasses próprias com `status` e `code`). Nunca lançar string ou objeto cru.
- Distinga erro **operacional** (entrada inválida, recurso inexistente, timeout: responda e siga) de erro de **programação** (bug: registre e reinicie o processo).
- Tratamento **central**: um middleware de erro no fim, não `try/catch` com resposta montada em cada rota. No Express 5, handler `async` que rejeita já cai no middleware de erro.
- Capture `unhandledRejection`; falhe rápido validando argumentos.
- Cliente recebe mensagem segura e código estável; **stack e detalhe interno só no log**.
- Documente os erros da API (OpenAPI).

## Segurança de API

- **Valide toda entrada** com schema (Zod, Joi, Ajv): body, query, params, headers. Rejeite campo desconhecido. Valide no controller; o service assume dado válido.
- **Injeção SQL:** só consulta parametrizada (`?`/`@nome`) em `prepare()`. Nunca concatenar valor. Coluna e ordem dinâmicas só por lista permitida (`database/ordenacao.js`); nunca `sortBy` da URL direto no SQL.
- Autenticação e autorização em **toda** rota (padrão: negar). Confira dono/permissão do recurso, não só "está logado". Senha com hash lento (bcrypt/argon2/scrypt), nunca em log nem em resposta.
- Cabeçalhos de segurança (`helmet`); CORS com origem explícita, nunca `*` em produção; HTTPS em produção.
- Limite de taxa (rate limit) e de tamanho de payload (`express.json({ limit })`). Limite de requisições simultâneas atrás de proxy.
- Sem `eval`, sem `require` com variável, cuidado com `child_process` (nunca montar comando com entrada do usuário; `execFile` com lista de argumentos). Escape de saída.
- Auditoria de dependências contínua (`npm audit`, Dependabot) e regras de segurança do linter. Não publicar segredo no npm (`files`/`.npmignore`). Cookie de sessão com `httpOnly`, `secure`, `sameSite`.

## Design de API REST

- Recurso é substantivo; verbo vem do método HTTP: `GET` ler, `POST` criar, `PUT` substituir, `PATCH` alterar parte, `DELETE` remover. Nomes consistentes.
- Códigos corretos (200/201/204, 400, 401, 403, 404, 409, 422, 429, 500). Corpo de erro sempre no mesmo formato.
- Listas sempre paginadas (`{ rows, total, page, pageSize }` neste projeto), com ordenação e filtro validados. Mudança que quebra contrato: versionar.
- Idempotência em `PUT`/`DELETE`; `POST` repetível só com chave de idempotência quando o custo de duplicar é alto.

## Banco (SQLite via better-sqlite3)

- `prepare()` uma vez e reutilize. Operação de várias escritas dentro de `db.transaction()`. Modo WAL e `foreign_keys = ON`.
- Índice nas colunas de `WHERE`, `JOIN` e `ORDER BY` mais usadas; índice composto na ordem de seletividade e uso. Confirme com `EXPLAIN QUERY PLAN` (procure `SCAN` onde devia ser `SEARCH`).
- Nada de `SELECT *` em lista; traga só as colunas usadas. Evite N+1 (uma consulta com `JOIN`/`IN`, não uma por linha). `LIMIT` sempre em listas; paginação por chave (`WHERE id > ?`) quando a tabela crescer.
- Alteração de esquema só por **migração versionada**, pequena e reversível, testada em cópia do banco. Mudar coluna: acrescentar, migrar dados, trocar uso, só depois remover. Backup antes de migração destrutiva.
- ORM é opcional; a regra de ouro é parametrizar, com ou sem ORM.

## Performance

- **Não bloquear o event loop:** nada de `*Sync` em requisição (exceto better-sqlite3, que é síncrono por desenho: mantenha consultas curtas e indexadas), nada de laço pesado, `JSON.parse` gigante ou regex catastrófica. Trabalho pesado vai para worker thread ou fila.
- Prefira métodos nativos do JS a utilitários tipo Lodash.
- Compressão de resposta e cache (`ETag`/`Cache-Control`) onde o dado permite. Medir antes de otimizar: perfil (`--prof`, `clinic`) ou tempo de consulta, não palpite.

## Atualização de framework

Express, better-sqlite3 e Node mudam de versão maior com quebras. **Sugira** a atualização quando houver ganho real (segurança, suporte, desempenho), explique o risco e **peça confirmação** antes de mexer em `package.json`/lockfile.
