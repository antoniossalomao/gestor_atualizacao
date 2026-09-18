# ADR-0004 — Injeção de dependência na mão, sem container

**Situação:** Aceita

## Contexto

O servidor tem ~13 serviços e ~13 controllers, com dependências reais entre
eles: quase todo serviço recebe o banco e o `HistoricoService`; o
`AlertaAgenteService` recebe `VersaoService` e `NotificationService`; o
`SaudeService` recebe banco, backups e versões.

Esse é o ponto em que projetos Node costumam adotar um container de DI
(`awilix`, `tsyringe`, `InversifyJS`) ou partir para singletons importados
diretamente (`const db = require('./db')` em cada arquivo).

## Decisão

A classe `Server` monta tudo à mão, em ordem explícita, em dois métodos:
`_buildServices()` e `_buildControllers()`. Cada dependência é passada pelo
construtor.

Nenhum serviço importa outro diretamente. Nenhum módulo exporta instância
pronta — só classes.

## Consequências

**Ganhos**
- **Existe um arquivo que mostra o sistema inteiro.** Ler `Server.js` de cima a
  baixo revela todos os componentes e quem depende de quem. Nenhum container
  oferece isso.
- Testar é instanciar com o que se quiser no lugar. Os testes sobem um `Server`
  completo com banco temporário justamente porque montar é barato.
- Ciclo de dependência vira erro na hora de escrever, não em tempo de execução:
  não dá para passar para o construtor de A um B que ainda não foi criado.
- Zero mágica: nenhuma resolução por nome, nenhum decorator, nenhum
  `reflect-metadata`.

**Custos aceitos**
- Acrescentar um serviço exige editar `Server.js`. É uma linha — e o incômodo é
  proporcional ao custo real de acrescentar um serviço, o que é saudável.
- A ordem de construção dentro de `_buildServices()` importa (`historico` e
  `versoes` são criados antes de quem os recebe). Está explícito no código.
- Uma instância de `BackupService` acaba criada duas vezes (uma para `backups`,
  outra dentro de `saude`). Inofensivo — a classe não guarda estado —, mas é o
  tipo de duplicação que um container evitaria de graça.

## Alternativas consideradas

- **Container de DI (`awilix` etc.)** — descartado: resolve acoplamento em
  sistemas com dezenas de módulos e múltiplos escopos de vida. Aqui, com um
  único escopo (o processo) e ~26 objetos, o custo de entendimento supera o
  ganho.
- **Singletons via `module.exports = new Service()`** — descartado: é o padrão
  que mais atrapalha teste em Node. Uma vez que um módulo abre o banco no
  `require`, não há mais como testá-lo com outro banco sem truque de cache de
  módulo.
