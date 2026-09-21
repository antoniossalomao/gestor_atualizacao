# ADR-0007 — Piloto, rollback e concorrência otimista

## Estado

Aceito em setembro de 2026.

## Contexto

Uma publicação geral alcança automaticamente todos os agentes de um sistema.
Ao mesmo tempo, duas pessoas podem abrir o mesmo agendamento e salvar versões
diferentes sem perceber a edição concorrente.

## Decisão

- Versões restritas usam `alcance = piloto` e uma lista de códigos de clientes
  vindos do cadastro. O endpoint do agente escolhe primeiro um piloto destinado
  àquele código (mantendo `cnpj` apenas como nome legado no contrato do Worker) e,
  para os demais, mantém a publicação geral.
- Promover um piloto reutiliza a mesma transação atômica de publicação geral.
- Rollback restaura a versão que foi diretamente substituída pela versão ativa
  e tira a versão problemática de circulação na mesma transação SQLite.
- Registros editáveis recebem um número de revisão. O cliente envia a revisão
  que abriu e o servidor responde `409 Conflict` quando outra gravação já a
  incrementou.

## Consequências

O agente continua usando o contrato existente de `update/check`; a seleção do
alcance fica inteiramente no servidor. O histórico de versões permanece
auditável, pois promoção e rollback mudam estados em vez de apagar linhas.
Interfaces de edição precisam conservar e reenviar a revisão recebida.
