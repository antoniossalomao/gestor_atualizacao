# ADR-0008 — Uma regra só para "o cliente está em dia?"

**Situação:** Aceita (setembro de 2026)

## Contexto

Três telas respondiam a mesma pergunta de três jeitos:

- **Resumo:** "em dia" era quem teve **qualquer** atendimento nos últimos 60
  dias; o resto era "desatualizado". Não olhava versão nenhuma. Cliente
  atendido ontem com a NFe velha aparecia em dia; cliente sem visita há três
  meses, mas sem nenhuma versão nova para receber, aparecia desatualizado.
- **Sistemas** e **ficha do cliente:** comparavam o texto da versão recebida
  com o da oficial usando `===`. Quem recebeu uma versão **mais nova** que a
  oficial (versão de teste, ou oficial rebaixada) aparecia como atrasado.
- B_Atualizador e Suporte Bredas, que não têm versão atrasada, entravam na
  conta como qualquer outro sistema.

Medido numa cópia do banco de produção (24/09/2026), com a regra estrita
("sem versão registrada = não dá para saber"): de 369 clientes, 21
desatualizados, **348 pendentes** e 0 em dia. Os atendimentos de antes da
versão oficial existir não gravaram versão (1.275 sistemas nessa condição), e
o indicador novo não serviria para nada.

## Decisão

Uma regra, no servidor, em `server/src/services/situacaoVersao.js`, usada pelo
Resumo, pela aba Sistemas e pela situação do cliente.

**Por sistema:**

| Caso | Situação |
|---|---|
| Nenhum atendimento naquele sistema | Nunca atualizado |
| Sistema sem versão oficial cadastrada | Sem referência |
| Versão recebida (data) **anterior** à oficial | Desatualizado |
| Versão recebida igual ou **posterior** à oficial | Em dia |
| Sem versão (ou versão que não é data) → data do atendimento anterior à oficial | Desatualizado, **pela data** |
| Sem versão → atendimento na data da oficial ou depois | Em dia, **pela data** |
| Sem versão e data do atendimento inválida | Sem informação |

- **Compara datas, não texto.**
- **A fonte é o atendimento.** O que o agente reporta não entra na conta.
- **"Pela data" é marcado**, e as telas escrevem "Em dia (pela data)". A versão
  recebida continua "Não informada": nada é gravado retroativamente, e editar
  o atendimento não muda isso.

**Por cliente** (grupos que não se sobrepõem, para os totais somarem):

- **Quem tem B_Vendas é julgado só pelo B_Vendas.** É o sistema que puxa a
  atualização dos outros: com ele em dia, a equipe considera o cliente
  atualizado, mesmo com outro sistema para trás. Na primeira versão desta
  regra (todos os sistemas precisavam estar em dia), a produção mostrou 21
  em dia, 245 desatualizados e 103 pendentes, de 369, o que não batia com o
  que a equipe vê. O nome fica fixo no código, por escolha da equipe.
- **Sem B_Vendas:** Desatualizado se algum sistema está desatualizado; senão
  Em dia se todos estão em dia; senão Verificação pendente.
- Quem não tem nenhum sistema que controle versão fica **fora da conta**.

A lista "sistemas com mais clientes atrasados" continua contando por sistema.
Um cliente em dia pelo B_Vendas ainda aparece nela se outro sistema dele
estiver atrasado.

**Sistemas fixos:** `sistemas.controla_versao` (migração 2), falso para
B_Atualizador e Suporte Bredas. Fixos e inativos não entram na situação do
cliente, mas continuam no cadastro, no histórico e na ficha.

**Tempo sem atualização** continua existindo, como indicador separado ("Sem
atualização há mais de N dias"), e não altera a situação de versão.

## Consequências

- O Resumo troca a rosca por um card com três totais clicáveis. As listas vão
  inteiras na resposta do `/resumo`, e o clique abre exatamente os clientes
  contados.
- A regra "pela data" é uma **dedução**, aceita pela equipe para o indicador
  ser útil já. Com o tempo, atendimentos novos gravam a versão oficial e a
  dedução deixa de ser usada naturalmente. Se ela passar a atrapalhar, basta
  remover o ramo "pela data" de `situacaoDoSistema`: o resto não muda.
- Datas continuam `dd/mm/aaaa`. Uma versão que não é data não é comparável e
  cai na regra da data do atendimento.
- A chave da regra da equipe continua `desatualizado_dias` (já gravada nas
  instalações); só o texto na Administração mudou para "Sem atualização".
- O que ficou para depois: tela para marcar ou desmarcar sistema fixo e
  bloqueio na API de oficial para sistema fixo (resto do I04).
