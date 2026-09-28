# ADR-0009 — Campanhas de atualização: meta guardada, andamento calculado

**Situação:** Aceita (setembro de 2026)

## Contexto

A equipe precisava acompanhar uma entrega com prazo — "todo cliente de B_NFe
na versão 25/09/2026 até o dia 30, por causa da Nota Técnica da SEFAZ" — e
responder a qualquer momento: quantos já receberam, quem falta, quem já está
agendado.

O Resumo e a aba Sistemas não respondem isso. Os dois julgam contra a versão
oficial **de hoje** (ADR-0008): se uma oficial mais nova sai no meio do
prazo, todo mundo que cumpriu a meta volta a aparecer como atrasado, e o
placar da entrega some.

Três desenhos eram possíveis para guardar uma campanha:

1. Copiar a lista de clientes na criação e marcar cada um como concluído à
   mão.
2. Copiar a lista de clientes na criação e marcar concluído automaticamente.
3. Guardar só a meta (sistema, versão-alvo, prazo) e calcular tudo o resto a
   cada leitura.

## Decisão

**Opção 3.** A migração 4 cria uma tabela só, `campanhas`, com a meta. Nada
mais é gravado por campanha:

- **Quem entra:** os clientes que têm o sistema no cadastro
  (`cliente_sistemas`), lidos ao vivo. Cliente cadastrado depois da criação
  entra; cliente que perdeu o sistema sai.
- **Quem está atualizado:** o último atendimento do cliente no sistema passa
  por `situacaoDoSistema` (a mesma função da ADR-0008) contra a
  **versão-alvo**. Versão recebida igual ou mais nova conta; sem versão
  registrada, vale a data do atendimento, marcado "pela data". **Não existe
  baixa manual**: a baixa é registrar a atualização em Atualizações, como
  sempre.
- **Quem já está agendado:** tem uma tarefa em aberto (não concluída, não
  arquivada) do **mesmo sistema**. Estar atualizado ganha de estar agendado.
- **A meta não anda:** a versão-alvo é uma cópia, não uma referência à
  oficial. Editar a campanha muda só título, descrição e prazo.
- **Encerrar congela o placar** (`total_final`, `atendidos_final`): a
  campanha encerrada mostra o resultado que teve, não o de hoje. Reabrir
  volta a contar ao vivo.
- Sistemas fixos (ADR-0008, `controla_versao = 0`) não podem ter campanha: não
  há versão para cobrar, e ela nunca terminaria.

Código: `server/src/services/CampanhaService.js`,
`server/src/database/CampanhaRepository.js`, migração 4 em
`server/src/database/migracoes.js`; tela em `client/js/views/CampanhasView.js`.

## Consequências

- Um lugar só para a verdade: o histórico de atualizações. A campanha nunca
  discorda dele, porque não guarda nada que ele já saiba.
- Registrar a atualização continua sendo o único gesto da equipe — ninguém
  precisa lembrar de "dar baixa" também na campanha.
- A lista de uma campanha ativa muda sozinha quando o cadastro muda. É o
  desejado para uma meta do tipo "todo cliente do sistema"; não serve para
  uma campanha de uma lista escolhida à mão (não pedida até aqui).
- Cada leitura recalcula; com centenas de clientes e poucas campanhas, custa
  algumas consultas já existentes (`ultimaPorClienteNoSistema`).
- Excluir uma campanha apaga só a meta e o placar. Atualizações e tarefas
  criadas por causa dela ficam.

## Alternativas consideradas

- **Lista copiada com baixa manual (1):** duas fontes para a mesma pergunta,
  que divergem no primeiro esquecimento; e o cliente cadastrado depois ficaria
  de fora sem ninguém perceber.
- **Lista copiada com baixa automática (2):** resolve o esquecimento, mas
  ainda congela a população na criação e exige manter a cópia em dia a cada
  mudança de cadastro.
- **Julgar contra a oficial atual, como o Resumo:** foi o que motivou a
  campanha — a meta andaria sozinha a cada nova oficial.
- **Ligar a tarefa à campanha por uma coluna nova em `agendamentos`:** "já
  agendado" por sistema já responde a pergunta sem mexer na tabela de tarefas,
  e continua certo para tarefas criadas fora da campanha.
