# Ajustes do painel — plano de 30/09/2026

**Estado:** aprovado para execução. Nenhum item foi iniciado.
**Branch:** `ajustes-painel`.

Este plano é independente de `MELHORIAS.md`.

## Como executar este plano (leia antes de começar)

1. **Uma fase por vez.** Execute só a fase atual. Ao terminar, pare,
   apresente o resumo da fase e **pergunte se pode seguir para a próxima**.
   Não comece a fase seguinte sem a resposta.
2. **Ordem:** Fase 1 → 2 → 3 → 4 → 5. Dentro de cada fase, siga a ordem da
   seção "Ordem de execução" no fim deste arquivo.
3. **Um commit por item**, na branch `ajustes-painel`, com o ID no início da
   mensagem: `A01: agendamento não trava ao voltar para A Fazer`. A16 e A18
   podem ser divididos em um commit por pasta, sempre com o ID.
4. **Primeiro commit da sessão:** este arquivo (`A00: plano de ajustes do
   painel`), antes do A01.
5. **Não inclua a exclusão de `docs/MELHORIAS.md`** em nenhum commit. O
   arquivo aparece apagado no diretório de trabalho sem decisão tomada; o
   destino dele é decidido no A17.
6. **Não faça push** sem o usuário pedir.
7. **Marque o checklist** deste arquivo (`[x]`) no mesmo commit do item.
8. **Dúvida de regra de negócio, pergunte** em vez de supor. Se um item não
   puder ser reproduzido ou fugir do que está descrito aqui, pare e relate.
9. **Vocabulário:** o termo é sempre "atualização" / "última atualização".
   O termo antigo foi abolido em 30/09/2026 (A14) e não aparece em código,
   texto, comentário ou mensagem de commit.
10. **Relatório ao fim de cada fase:** o que foi feito por item, o resultado
    de `npm run check`, `npm test` e `npm run test:navegador`, e o que ficou
    pendente ou precisou de decisão.

## Como cada item é entregue

Antes de dar um item como pronto:

- `npm run check` e `npm test` passando;
- `npm run test:navegador` quando o item mexe em tela, componente ou CSS
  (quase todos aqui);
- entrada no `CHANGELOG.md` se o comportamento visível mudou;
- comentário explicando o **porquê** quando o bug não era óbvio.

## Visão geral

| ID | Fase | Tipo | Entrega |
|---|---|---|---|
| A01 | 1 | Bug | Agendamento trava ao sair de "Em Andamento" (provável: para "A Fazer") |
| A02 | 1 | Bug | Aviso de confirmação fica atrás do formulário do cliente |
| A03 | 1 | Bug | Regime tributário não aparece na Ficha 360° |
| A04 | 2 | Ajuste | Clientes sempre abre ordenado por ID crescente |
| A05 | 2 | Ajuste | "Nova campanha" na Ação rápida |
| A06 | 2 | Ajuste | Tabelas ocupam a altura disponível da página |
| A14 | 2 | Termo | "Atualização" como termo único no projeto inteiro |
| A07 | 3 | Regra + visual | Card "Atualização dos Clientes": prazo de 60 dias configurável |
| A13 | 3 | Regra | NFCe e Consignado M2 usam a data da última atualização do B_Vendas |
| A08 | 3 | Visual | Gráfico "Atualizações por sistema este mês" |
| A09 | 4 | Visual | Hierarquia de títulos em Administração e Configurações |
| A10 | 4 | Visual | Filtro da tela Sistemas |
| A11 | 4 | Conteúdo | Sobre e Ajuda |
| A12 | 4 | Visual | Tela de login |
| A15 | 5 | Limpeza | Apagar arquivos inúteis e backups de antes do Docker |
| A16 | 5 | Organização | Cada arquivo na pasta certa |
| A17 | 5 | Auditoria | Documentação de acordo com o código |
| A18 | 5 | Padrões | Revisão do código contra os padrões do projeto |

## Fase 1 — Bugs

### A01 — Agendamento trava ao sair de "Em Andamento"

**Sintoma:** ao mudar uma tarefa de "Em andamento" para "A fazer depois", o
quadro para de responder e só volta com F5.

**Atenção:** não existe status "A fazer depois". Os status são `A Fazer`,
`Em Andamento`, `Sem resposta` e `Concluído` (`client/js/config.js`). O
provável é `Em Andamento → A Fazer`. Confirme com o usuário no início do
item e teste todas as saídas de `Em Andamento`.

**Onde:** `client/js/views/AgendamentosView.js`. A mudança de status pode vir
do arrastar entre colunas (evento `drop`, perto da linha 450) ou do seletor
de status. Não está confirmado qual dos dois caminhos falha, ou se os dois
falham.

- [x] Reproduzir pelos dois caminhos, com o console aberto.
- [x] Achar a causa. Pelo sintoma, o provável é um erro no meio da
      atualização (resposta do servidor, cache ou estado do arrastar) que
      deixa o quadro inconsistente.
- [x] Corrigir e registrar a causa num comentário.
- [x] Teste que cobre a ida e a volta entre `Em Andamento` e os outros status.

**Aceite:** a tarefa vai e volta entre os status, pelos dois caminhos, sem
recarregar a página.

### A02 — Aviso de confirmação fica atrás do formulário do cliente

**Sintoma:** ao alterar algo no formulário do cliente, abre um aviso
(provavelmente de confirmação) que fica atrás do card de edição e trava a
tela.

**Onde:** formulário em `client/js/views/ClientesView.js`; camadas em
`client/css/components.css`. Hoje: modal em 1400, paleta de comandos em
1300, outros elementos em 1200, gaveta em 1050, e um elemento em 2000 no
`theme.css`.

- [x] Identificar qual aviso é e de onde ele sai.
- [x] Definir uma ordem única de camadas em variáveis do CSS (página →
      gaveta → formulário → aviso/modal → notificação) e trocar os números
      soltos por essas variáveis.
- [x] Ao fechar o aviso, devolver o foco ao campo do formulário.
- [x] Caso coberto no teste de navegador.

**Resultado (30/09/2026):** o aviso atrás do formulário não se reproduziu na
versão atual — os seis avisos que o formulário do cliente abre ficam por cima
(camadas corrigidas no P04). O que travava pelo teclado era o foco indo para o
campo atrás do aviso aberto. Sem a pasta `navegador/` (decisão do usuário), o
caso foi conferido num Chrome sem janela localmente e travado em
`client/tests/css.test.mjs`.

**Aceite:** o aviso sempre aparece por cima de qualquer formulário ou
gaveta, e dá para respondê-lo com o mouse e com o teclado.

### A03 — Regime tributário não aparece na Ficha 360°

**Onde:** o campo é gravado pelo cadastro (`ClienteService`, migração
"cidade das campanhas e regime tributário dos clientes"), mas a ficha
(`ConsultaView.js`, `templates/consulta.js`) não o exibe.

- [x] Conferir se a resposta da ficha já traz o campo; incluir se não trouxer.
- [x] Mostrar na ficha, junto de cidade e grupo. Quando vazio, mostrar "—".
- [x] Teste do servidor garantindo o campo na resposta.

**Aceite:** o regime cadastrado aparece na ficha do cliente.

## Fase 2 — Ajustes rápidos

### A04 — Clientes sempre abre ordenado por ID crescente

**Onde:** `ClientesView.js`, linha 32: hoje a tela restaura a última
ordenação salva (`prefs "clientes:filtros"`).

- [x] Ao abrir a aba, ordenar por ID crescente, sempre.
- [x] A ordenação escolhida pelo usuário vale enquanto ele estiver na tela;
      não é mais restaurada na próxima abertura. A busca pode continuar
      sendo lembrada.
- [x] Confirmar que o ID está liberado em `shared/sortHelper.js`.
- [x] Teste: a primeira página vem como 1, 2, 3…

### A05 — "Nova campanha" na Ação rápida

**Onde:** lista de itens em `client/js/app/App.js`, perto da linha 596.

- [x] Incluir "Nova campanha", abrindo o formulário de nova campanha.
- [x] Respeitar a permissão: botão desativado para quem não pode criar.

### A06 — Tabelas ocupam a altura disponível da página

**Sintoma:** mesmo com a altura das tabelas no máximo, a tabela termina
antes do fim da página.

- [x] Fazer a área da tabela ocupar a altura que sobra abaixo da barra de
      filtros, em vez de uma altura fixa.
- [x] Conferir em Clientes, Atualizações, Sistemas e Agendamentos, nas
      resoluções 1366×768 e 1920×1080 e em tela de celular.

**Aceite:** não sobra faixa vazia no fim da página e não aparece rolagem
dupla (página e tabela ao mesmo tempo).

### A14 — "Atualização" como termo único no projeto inteiro

**Decisão (30/09/2026):** o termo antigo não existe no vocabulário da equipe.
O registro é uma **atualização**, e a data que importa é a **última
atualização**. A palavra não pode aparecer em lugar nenhum.

**Levantamento:** cerca de 270 ocorrências. As telas já mostram quase tudo
como "atualização"; a maior parte está em comentários, nomes internos e
documentação.

| Onde | Ocorrências (aprox.) |
|---|---|
| `client/js` e `client/css` | 42 |
| `server/src` | 79 |
| `docs/` | 105 |
| `CHANGELOG.md` | 35 |
| `README.md`, `CONTRIBUTING.md` | 11 |

- [x] Textos das telas, mensagens de erro e relatórios: conferir um por um.
- [x] Nomes internos: o contador do Resumo e seu rótulo, o parâmetro de data
      da rota `/atualizacoes/por-sistema`, o `data-role` do filtro de data de
      Sistemas, o limite do relatório e o que mais aparecer. Passam a
      `semAtualizacao`, `rotuloSemAtualizacao`, `atualizacaoAntesDe`,
      `data-role="atualizacao-antes"` e `limiteAtualizacao`. O
      parâmetro da rota muda nos dois lados no mesmo commit, e a preferência
      salva no navegador (`sistemas:filtros`) passa a ler também o nome antigo.
- [x] Comentários: reescrever usando "atualização"/"última atualização", sem
      perder o porquê que eles registram.
- [x] Documentação, README, CONTRIBUTING e CHANGELOG (inclusive as entradas
      antigas).
- [x] Teste que falha se o termo antigo voltar a aparecer em `client/`,
      `server/src/` ou `docs/` (mesmo estilo de `html-seguro.test.mjs`). Ao
      concluir o plano, esta seção deixa de citar a palavra, e o teste não
      precisa de exceção.

**Aceite:** a busca pelo termo antigo no repositório não retorna nada.

## Fase 3 — Resumo

### A07 — Card "Atualização dos Clientes": prazo configurável

**Decisão (30/09/2026):** ter a última atualização anterior à versão oficial
não basta para o cliente estar desatualizado. Ele só fica **desatualizado
depois de 60 dias** sem receber a versão oficial vigente. O prazo é
configurável na tela Administração.

**Regra atual:** `server/src/services/situacaoVersao.js` (alterada em
29/09/2026). Uma última atualização anterior à data da versão oficial já
marca o cliente como "Desatualizado". Assim, todos ficam atrasados no dia
seguinte à publicação de uma versão.

**Regra nova, por sistema:**

| Situação | Condição |
|---|---|
| Em dia | última atualização na data da oficial ou depois |
| Aguardando atualização | última atualização anterior à oficial, e a oficial foi publicada há menos de N dias |
| Desatualizado | última atualização anterior à oficial, e a oficial foi publicada há N dias ou mais |

Os N dias contam a partir da **data da versão oficial** (o valor
dd/mm/aaaa cadastrado em Versões oficiais), e não da data em que alguém a
cadastrou no painel. É a data que todas as telas já mostram e que existe em
todos os sistemas. Se o usuário preferir a outra, a troca é só nesse ponto.

A regra de B_Vendas decidir sozinho a situação do cliente continua como está.

- [x] Nova regra em `server/src/config/regrasEquipe.js` (por exemplo
      `prazoVersaoDias`, padrão 60), exibida em Administração › Regras da
      equipe. **Não** reaproveitar `desatualizadoDias`: essa regra já existe,
      também vale 60 e mede outra coisa (tempo sem nenhuma atualização).
- [x] Levar o prazo para `situacaoDoSistema`/`situacaoDoCliente` e criar o
      grupo "Aguardando atualização", de cor neutra.
- [x] Usar a mesma regra no Resumo, em Sistemas e na Ficha, como já acontece
      hoje.
- [x] Testes: dia 0, dia N−1, dia N, oficial sem data, prazo alterado na
      Administração.
- [x] Redesenho do card: percentual em dia em destaque, uma barra, os totais
      clicáveis e a lista de sistemas mais enxuta. Menos notas de rodapé.
- [x] Registrar a decisão na seção de ADRs da `DOCUMENTACAO_CONSOLIDADA.md`
      e atualizar o comentário de `situacaoVersao.js`.

**Aceite:** uma versão oficial recém-publicada não deixa ninguém vermelho
antes do prazo; mudar o prazo na Administração muda as contagens do card.

### A13 — Sistemas dependentes do B_Vendas

**Decisão (30/09/2026):** NFCe e Consignado M2 (um sistema só) são
dependências do B_Vendas. Eles são atualizados junto com ele, então a
situação deles usa a **data da última atualização de B_Vendas** do cliente,
e não a data da própria última atualização.

**Situação atual:** `situacaoDoSistema` (em `situacaoVersao.js`) olha só a
última atualização do próprio sistema. Assim, um cliente com B_Vendas em dia
pode aparecer com NFCe atrasado na aba Sistemas e na Ficha, porque a
atualização não foi lançada para cada dependente.

Esses nomes não aparecem no código; eles vêm do catálogo de sistemas. Por
isso a dependência é uma marcação por sistema, e não uma lista fixa:

- [x] Confirmar no catálogo de produção os nomes exatos (por exemplo `B_NFCe`
      e o nome gravado de Consignado M2).
- [x] Nova coluna no catálogo (migração): "atualiza junto com o B_Vendas".
      Marcação editável em Administração, ao lado de "controla versão"
      (`OperacaoAdmin.js`). A migração já marca NFCe e Consignado M2.
- [x] Na situação por sistema, um sistema marcado usa a data da última
      atualização de B_Vendas do cliente. A data é comparada com a versão
      oficial **do próprio sistema** e com o prazo de A07.
- [x] Cliente sem B_Vendas: o dependente volta a usar a própria última
      atualização.
- [x] Vale igual no Resumo, em Sistemas e na Ficha. Na Ficha, indicar que a
      data veio do B_Vendas (por exemplo "pela data do B_Vendas").
- [x] Testes: dependente sem atualização própria e B_Vendas em dia (fica em
      dia); B_Vendas atrasado (dependente atrasado); cliente sem B_Vendas;
      marcação desligada na Administração.
- [x] Registrar no mesmo ADR de A07 e no comentário de `situacaoVersao.js`.

**Observação:** na situação **do cliente** isso quase não muda nada, porque
quem tem B_Vendas já é julgado só por ele. A mudança aparece na visão **por
sistema**: aba Sistemas, Ficha e "Onde estão os atrasos" do Resumo.

**Aceite:** um cliente atualizado no B_Vendas não aparece atrasado em NFCe ou
Consignado M2 só porque a atualização não foi lançada nesses sistemas.

### A08 — Gráfico "Atualizações por sistema este mês"

**Onde:** `BarChart` criado em `ResumoView.js`, linha 139.

- [x] Barras horizontais em ordem decrescente, com o número no fim da barra.
- [x] Comparação com o mês anterior (▲/▼ e diferença).
- [x] No máximo 8 sistemas; os demais somados em "Outros".
- [x] Clicar numa barra abre Atualizações filtrada pelo sistema e pelo mês.
- [x] Estado vazio claro quando não houver atualização no mês.

## Fase 4 — Organização visual

### A09 — Hierarquia de títulos em Administração e Configurações

**Sintoma:** título de seção e nome de configuração têm o mesmo tamanho e o
mesmo peso. Exemplos: "Dados e importação" › "Histórico de atualizações";
"Regras da equipe".

**Onde:** `client/js/views/administracao/` e `client/js/views/configuracoes/`.

- [ ] Três níveis no CSS: título da seção (grande, com linha divisória), nome
      da configuração (médio, em negrito) e descrição (pequena, cor
      secundária).
- [ ] Aplicar em todas as seções das duas telas, não só nos exemplos.

### A10 — Filtro da tela Sistemas

**Onde:** `SistemasView.js`, perto da linha 50.

- [ ] Alinhar o botão "Limpar data" ao campo de data.
- [ ] Remover a dica abaixo do campo ("Filtra a data da atualização; a
      situação continua usando a versão oficial.").
- [ ] Deixar o painel de filtros no mesmo padrão das outras telas.

### A11 — Sobre e Ajuda

**Sintoma:** falta informação, e há textos soltos pela tela.

- [ ] Organizar em blocos: versão e novidades; como usar cada tela; atalhos
      de teclado; como a situação do cliente é calculada (depende de A07);
      contato e suporte.
- [ ] Mover ou remover os textos que hoje estão fora desses blocos.

### A12 — Tela de login

- [ ] Identidade visual: painel com marca e nome do sistema em telas largas,
      formulário sozinho no celular.
- [ ] Estados claros de carregando e de erro.
- [ ] Botão de mostrar senha e aviso de Caps Lock ligado.
- [ ] Revisar no tema claro e no escuro.
- [ ] Sem biblioteca externa nem etapa de build (ADR-0001).

## Fase 5 — Limpeza, organização e auditoria

Fica por último de propósito: roda sobre o código já com as Fases 1 a 4
entregues, para não limpar ou documentar algo que ainda vai mudar. Os quatro
itens seguem nesta ordem, um commit cada (A15 pode virar mais de um commit
se a lista for grande).

### A15 — Limpeza

**Regra de backup:** o painel passou a rodar em Docker em **22/09/2026**
(commit `df62502`). Backup de antes dessa data pode ser apagado; de depois,
fica.

Levantamento feito agora (arquivos locais, fora do git):

| Onde | O que tem | Destino |
|---|---|---|
| `server/data/backups/` | 4 bancos de 18/09 e 21/09 + `verificacoes.json` | **apagar** os bancos (antes do Docker); conferir se o `.json` ainda é lido |
| `server/data/backup-antes-p01/` | banco de 29/09 | manter |
| `../backups-deploy/` | 2 bancos de 29/09 | manter |
| `server/data/gestao.db` e `sessions.sqlite` | banco local de 22/09 | conferir se ainda é usado fora do Docker |

- [ ] Conferir também a pasta de backups dentro do volume do Docker no
      servidor (192.168.0.85), com a mesma regra de data.
- [ ] Varrer o repositório inteiro atrás de arquivo sem uso: módulo que
      ninguém importa, CSS sem seletor usado, ícone não referenciado, script
      antigo, documento que ninguém mais cita, teste de algo que não existe.
- [ ] Varrer código morto dentro dos arquivos: função exportada e nunca
      chamada, regra de configuração não lida, rota sem tela.
- [ ] **Antes de apagar, entregar a lista com o motivo de cada item para
      aprovação.** Bancos e backups não estão no git; apagar é definitivo.
- [ ] Fora do escopo: a pasta `../atualizador` (o Atualizador Automático
      está pausado).

**Aceite:** tudo o que sobrou tem uso conhecido; `npm run check`, `npm test`
e `npm run test:navegador` continuam passando.

### A16 — Organização

- [ ] Conferir cada arquivo contra a regra de pastas do `CLAUDE.md`:
      servidor em `routes → controllers → services → database`, SQL só em
      `database/`, `shared/` só com dois consumidores; front em `utils/`,
      `domain/`, `templates/`, `components/`, `views/` e `app/`.
- [ ] `domain/`, `templates/` e `utils/` sem nenhum acesso ao DOM.
- [ ] Nomes de arquivo no mesmo padrão da pasta (classe em PascalCase,
      módulo de funções em camelCase) e em português.
- [ ] Testes ao lado do que testam e com nomes que digam a regra coberta.
- [ ] Mover o que estiver fora do lugar, sem mudar comportamento.

**Aceite:** nenhum arquivo fora da regra de pastas; `npm run check` passa.

### A17 — Auditoria da documentação

- [ ] `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CLAUDE.md`,
      `docs/OPERACAO.md` e `docs/DOCUMENTACAO_CONSOLIDADA.md`: conferir cada
      afirmação contra o código atual (comandos, variáveis do `.env`, rotas,
      regras, portas, forma de instalação com Docker e Caddy).
- [ ] Incluir as decisões deste plano (A07, A13 e A14) nos ADRs.
- [ ] Remover o que descreve coisa que não existe mais, e os links
      quebrados.
- [ ] Decidir o destino de `docs/MELHORIAS.md` (hoje apagado no diretório de
      trabalho, sem commit) e deste `ajustes.md` quando o plano terminar.

**Aceite:** quem seguir o README instala e sobe o painel sem precisar de
informação de fora.

### A18 — Revisão dos padrões do código

Revisão arquivo por arquivo, dividida por pasta, com um commit por pasta se
ficar grande.

- [ ] **Orientação a objetos onde o projeto já usa:** views, componentes,
      serviços, controladores e repositórios como classes, com
      responsabilidade única e sem lógica de negócio duplicada. `domain/`,
      `utils/` e `templates/` continuam como funções puras: é o que as torna
      testáveis sem navegador, e não é para virar classe.
- [ ] **Organização interna:** métodos curtos, nomes que dizem o que fazem,
      nada de função gigante com tudo misturado.
- [ ] **Comentários:** explicam o **porquê** (armadilha, decisão da equipe,
      bug de produção). Ficam os que já existem e são desse tipo; saem os que
      só repetem o que a linha faz.
- [ ] **Sem cara de código gerado por IA.** Tirar:
      - comentário que narra o óbvio (`// incrementa o contador`,
        `// Passo 1:`);
      - faixas decorativas de seção e emojis;
      - JSDoc longo em função trivial;
      - verificação defensiva repetida para algo que nunca acontece;
      - nomes genéricos (`data`, `result`, `handleStuff`, `helper`);
      - texto de marketing em comentário ("robusto", "eficiente",
        "de forma elegante");
      - inglês fora do que a linguagem impõe.
- [ ] Rodar a verificação completa ao final de cada pasta.

**Aceite:** um desenvolvedor novo lê qualquer arquivo e entende o que faz e
por que é daquele jeito, sem comentários de enfeite.

## Ordem de execução

1. **Fase 1** — A01, A02, A03.
2. **Fase 2** — A04, A05, A06 e A14. A14 vem antes da Fase 3 para que A07
   e A13 já sejam escritos com o termo certo.
3. **Fase 3** — A07, A13 (mesma regra, logo em seguida), depois A08.
4. **Fase 4** — A09, A10, A11 (depois de A07) e A12.
5. **Fase 5** — A15, A16, A17 e A18, nesta ordem, depois de todas as outras.
