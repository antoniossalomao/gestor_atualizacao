## O que muda, e por quê

<!-- O "o quê" o diff já mostra. Escreva o PORQUÊ: que problema isso resolve,
     ou que decisão foi tomada. Se corrige um bug, descreva o sintoma como ele
     aparecia para quem usa. -->

## Como conferir

<!-- O caminho exato para ver isso funcionando na tela, ou o teste que prova.
     "Abrir Agendamentos, concluir uma tarefa, editar o responsável, conferir
     que a data de conclusão não mudou." -->

## Antes de pedir revisão

- [ ] `npm run check` passa (verificação de tipos)
- [ ] `npm test` passa (servidor + front-end)
- [ ] Toda regra que, se quebrar, **erra em silêncio** tem teste
- [ ] Comentário novo explica *por quê*, não *o quê*
- [ ] Se mexi em rota: conferi `requireAuth`/`requireRole` em `routes/index.js`
- [ ] Se montei HTML com dado do usuário: passei por `escapeHtml`
- [ ] Se ordeno por coluna: usei `shared/sortHelper.js`, não interpolei no SQL
- [ ] Se a decisão é cara de reverter: escrevi um ADR em `docs/adr/`
- [ ] Se muda o comportamento para quem usa: atualizei `CHANGELOG.md`

<!-- Item que não se aplica: risque em vez de marcar (~~texto~~) e siga. -->
