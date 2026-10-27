# Relatório de Diagnóstico e Correção de Falhas

## Diagnóstico: Regressão de Performance (Prepared Statements)

### Análise do Problema
Durante a análise dos últimos commits e dos repositórios de banco de dados, foi identificada uma regressão de performance introduzida silenciosamente.

O commit `5e85b35` (`refactor: use cached prepared statements in repositories for performance`) introduziu uma otimização importante: a utilização do método `this._preparado(...)` para fazer cache de declarações SQL estáticas nos repositórios, retendo `this.conn.prepare(...)` apenas para queries dinâmicas, conforme as decisões arquiteturais do projeto.

No entanto, o commit subsequente `d6d7993` (`Merge pull request #26 from antoniossalomao/feat/codigo-cliente-e-tempo-real`) desfez inadvertidamente essas alterações em múltiplos repositórios, revertendo as chamadas de `this._preparado` de volta para `this.conn.prepare`. Isso causou uma degradação de performance por forçar a recompilação contínua dos mesmos comandos SQL em chamadas frequentes.

### Impacto
- **Perda de Performance:** Consultas repetitivas, especialmente listagens e checagens rápidas, perderam o benefício do statement caching.
- **Inconsistência de Código:** O código passou a violar as diretrizes de performance arquiteturais do sistema documentadas na memória do projeto, misturando estratégias otimizadas e subotimizadas de forma aleatória nas classes que herdam de `BaseRepository`.

---

## Sugestão de Código Pronta para Correção

A correção consiste em restaurar as alterações do commit `5e85b35`, substituindo `this.conn.prepare` por `this._preparado` em todos os repositórios afetados, mas deixando as queries dinâmicas intactas. Como os arquivos já foram restaurados na base de código através de `git checkout`, o código sugerido abaixo ilustra as alterações aplicadas.

Os arquivos corrigidos são:
- `server/src/database/AgendamentoRepository.js`
- `server/src/database/AtualizacaoRepository.js`
- `server/src/database/BaseRepository.js`
- `server/src/database/CampanhaRepository.js`
- `server/src/database/ClienteRepository.js`
- `server/src/database/VersaoRepository.js`

### Exemplo de Correção (`server/src/database/VersaoRepository.js`)

**Trecho Anterior (Regressão):**
```javascript
<<<<<<< SEARCH
  list() {
    return this.conn.prepare(`SELECT ${CAMPOS} FROM ${this.table} ORDER BY id DESC`).all();
  }

  find(id) {
    return this.conn.prepare(`SELECT ${CAMPOS} FROM ${this.table} WHERE id = ?`).get(id);
  }
=======
  list() {
    return this._preparado(`SELECT ${CAMPOS} FROM ${this.table} ORDER BY id DESC`).all();
  }

  find(id) {
    return this._preparado(`SELECT ${CAMPOS} FROM ${this.table} WHERE id = ?`).get(id);
  }
>>>>>>> REPLACE
```

Essas alterações pontuais corrigem a regressão sem afetar a estabilidade do sistema e asseguram os benefícios de cache das queries SQLite novamente.

## Diagnóstico 2: Regressão de Performance (Prepared Statements)

### Análise do Problema
Durante a análise dos últimos commits e dos repositórios de banco de dados, foi identificada uma regressão de performance introduzida silenciosamente.

O commit `5e85b35` (`refactor: use cached prepared statements in repositories for performance`) introduziu uma otimização importante: a utilização do método `this._preparado(...)` para fazer cache de declarações SQL estáticas nos repositórios, retendo `this.conn.prepare(...)` apenas para queries dinâmicas, conforme as decisões arquiteturais do projeto.

No entanto, o commit subsequente `d6d7993` (`Merge pull request #26 from antoniossalomao/feat/codigo-cliente-e-tempo-real`) desfez inadvertidamente essas alterações em múltiplos repositórios, revertendo as chamadas de `this._preparado` de volta para `this.conn.prepare`. Isso causou uma degradação de performance por forçar a recompilação contínua dos mesmos comandos SQL estáticos.

### Impacto
- **Perda de Performance:** Consultas repetitivas, especialmente listagens e checagens rápidas, perderam o benefício do statement caching.

---

## Sugestão de Código Pronta para Correção

A correção consiste em restaurar as alterações do commit `5e85b35`, substituindo `this.conn.prepare` por `this._preparado` nos repositórios afetados, mas **deixando as queries dinâmicas** (como strings template com marcadores dinâmicos, ex: `IN (${marcadores})`) usando `this.conn.prepare`.

### Arquivo: `server/src/database/VersaoRepository.js`

**Trechos a corrigir (substituir this.conn.prepare por this._preparado):**
```javascript
<<<<<<< SEARCH
  list() {
    return this.conn.prepare(`SELECT ${CAMPOS} FROM ${this.table} ORDER BY id DESC`).all();
  }

  find(id) {
    return this.conn.prepare(`SELECT ${CAMPOS} FROM ${this.table} WHERE id = ?`).get(id);
  }
=======
  list() {
    return this._preparado(`SELECT ${CAMPOS} FROM ${this.table} ORDER BY id DESC`).all();
  }

  find(id) {
    return this._preparado(`SELECT ${CAMPOS} FROM ${this.table} WHERE id = ?`).get(id);
  }
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
  publicadasPorSistema() {
    return this.conn.prepare(`SELECT ${CAMPOS} FROM ${this.table} WHERE status = 'publicada' ORDER BY sistema COLLATE NOCASE`).all();
  }
=======
  publicadasPorSistema() {
    return this._preparado(`SELECT ${CAMPOS} FROM ${this.table} WHERE status = 'publicada' ORDER BY sistema COLLATE NOCASE`).all();
  }
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
  publicarPiloto(id, publicadoEm) {
    this.conn.prepare(`UPDATE ${this.table} SET status = 'piloto', publicado_em = @publicadoEm WHERE id = @id`).run({ id, publicadoEm });
    return this.find(id);
  }

  pilotosDoSistema(sistema) {
    return this.conn.prepare(`SELECT ${CAMPOS} FROM ${this.table} WHERE status = 'piloto' AND sistema = ? ORDER BY id DESC`).all(sistema);
  }
=======
  publicarPiloto(id, publicadoEm) {
    this._preparado(`UPDATE ${this.table} SET status = 'piloto', publicado_em = @publicadoEm WHERE id = @id`).run({ id, publicadoEm });
    return this.find(id);
  }

  pilotosDoSistema(sistema) {
    return this._preparado(`SELECT ${CAMPOS} FROM ${this.table} WHERE status = 'piloto' AND sistema = ? ORDER BY id DESC`).all(sistema);
  }
>>>>>>> REPLACE
```

### Arquivo: `server/src/database/BaseRepository.js`

**Trechos a corrigir (apenas métodos delete(id) e count()):**
```javascript
<<<<<<< SEARCH
  delete(id) {
    return this.conn.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id).changes;
  }
=======
  delete(id) {
    return this._preparado(`DELETE FROM ${this.table} WHERE id = ?`).run(id).changes;
  }
>>>>>>> REPLACE
```

```javascript
<<<<<<< SEARCH
  count() {
    const row = this.conn.prepare(`SELECT COUNT(*) AS total FROM ${this.table}`).get();
    return row.total;
  }
=======
  count() {
    const row = this._preparado(`SELECT COUNT(*) AS total FROM ${this.table}`).get();
    return row.total;
  }
>>>>>>> REPLACE
```

*Nota: O método `deleteLote(ids)` no BaseRepository.js deve manter `this.conn.prepare` porque a query possui um `IN (${marcadores})` gerado dinamicamente.*
