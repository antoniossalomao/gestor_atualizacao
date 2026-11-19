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
- [ ] Se mexi em rota: conferi `exigirLogin`/`exigirPapel` em `routes/index.js`
- [ ] Se montei HTML com dado do usuário: usei a tag `html` (`client/js/utils/html.js`)
- [ ] Se ordeno por coluna: usei `server/src/database/ordenacao.js`, não interpolei no SQL
- [ ] Se a decisão é cara de reverter: registrei em `docs/ARQUITETURA.md`
- [ ] Se muda o comportamento para quem usa: atualizei `CHANGELOG.md`

<!-- Item que não se aplica: risque em vez de marcar (~~texto~~) e siga. -->
