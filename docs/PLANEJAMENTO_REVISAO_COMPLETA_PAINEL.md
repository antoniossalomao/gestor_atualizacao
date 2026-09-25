# Planejamento completo de revisão do painel web

Data: 24/09/2026  
Situação: proposta para revisão; implementação não iniciada por este planejamento.  
Escopo: identidade, indicadores, tabelas, relatórios, agendamentos, clientes, sistemas, usuários, administração, configurações e evolução do produto.

## 1. Objetivo e limites da análise

Tornar o painel mais coerente com a operação: saber quem precisa de atualização, organizar atendimentos e produzir relatórios úteis, com menos controles disputando atenção.

A análise foi feita sobre o código atual das telas, componentes, serviços e repositórios. As observações visuais do usuário são requisitos deste plano. O desalinhamento dos meses, o número 121 e a aparência do ícone precisam ser reproduzidos no navegador durante a execução: nesta etapa não houve nova inspeção visual de todas as telas nem consulta ao banco de produção para confirmar esse valor.

A normalização dos relacionamentos de clientes, sistemas e atualizações, com migrações numeradas, já está consolidada (commit `cba726c`). A execução parte desse esquema, sem reconstruir o modelo antigo. Os documentos anteriores de planejamento não foram localizados pelos padrões pesquisados na árvore atual; este documento não presume que seus itens antigos ainda estejam pendentes.

Somente este documento é criado nesta etapa. Interface, regras, dados e configurações do painel permanecem sem alteração por este trabalho.

### Regras já acordadas que precisam permanecer

- Uma nova atualização guarda as versões oficiais dos sistemas informados naquele atendimento.
- Alterar a oficial não muda a versão recebida anteriormente por um cliente.
- Editar observações não deve reaplicar versões atuais ao atendimento antigo.
- Histórico sem versão comprovada não recebe a referência de hoje retroativamente.
- B_Atualizador e Suporte Bredas são sistemas fixos, conforme definição do usuário, sem controle de defasagem de versões.
- O relatório do chamado segue o formato aprovado, sem ID, código, cidade ou motivo.
- Converter agendamento em atualização deve sair da interface.
- Publicação de pacotes continua em Versões; acompanhamento de agentes, em Distribuição.

## 2. Rastreabilidade dos pedidos e prioridades

| ID | Pedido | Diagnóstico atual | Direção proposta | Prioridade |
|---|---|---|---|---|
| I01 | Logo e nome sem identidade | Cabeçalho usa ATUALIZADOR / Gestor de clientes | ✅ Concluído em 24/09/2026 (seção 4) | P1 |
| I02 | Situação dos clientes pouco útil | Em dia é calculado pelo complemento de clientes sem atualização recente | ✅ Concluído em 24/09/2026 (seções 3.3 e 5.1; ADR-0008) | P0 |
| I03 | Tendência desalinhada | SVG com margens fixas e rótulo final junto ao ponto | Corrigir calendário, eixos, margens e rótulos | P1 |
| I04 | Sistemas fixos aparecem nos indicadores | Catálogo contém ambos, sem política explícita central de exclusão | ✅ Concluído em E2: classificação administrável, exclusões e API (seção 3.2) | P0 |
| I05 | Fundo escuro no alerta | Estilos próprios do ícone e do estado is-alert | Ícone simples e apresentação coerente | P1 |
| I06 | Excluir e outros botões sem borda | Uso de btn--ghost em ações | Contorno visível e estados padronizados | P1 |
| I07 | Datas poluem Atualizações | De/Até e atalhos ficam permanentemente na toolbar | Filtros recolhíveis e chips do recorte ativo | P1 |
| I08 | Planilhas com destaque excessivo | Importar/exportar no topo operacional | Exportar em menu; importar em fluxo de Dados | P1 |
| I09 | Seletor e tela de relatórios feios | Modal com select e prévia longa | Abas, hierarquia e rodapé estável | P1 |
| I10 | Agendamentos ocupa espaço | Faixa superior apenas para criar tarefa | Criação discreta junto à grade | P1 |
| I11 | Remover conversão | Botão, listener e método ainda existem | Remover todos os caminhos de interface | P1 |
| I12 | Arquivar manualmente sumiu | Método e rota existem; recuperar acesso pela interface | Ação explícita em tarefa concluída | P0 |
| I13 | Acessos grande em Clientes | Topo tem gestão; linha tem cópia, que é outra função | Gerenciar pela linha; manter cópia distinta | P1 |
| I14 | Grupo/Rede grande | Campo e coluna competem com informação principal | Reduzir largura nos dois contextos | P1 |
| I15 | Melhorar ficha e retirar CNPJ | Consulta já tem subabas e renderiza CNPJ | Hierarquia compacta e retirada da ficha | P1 |
| I16 | Separar filtro e versão oficial | Mesmo campo consulta ao digitar e grava ao salvar | ✅ Concluído em E3: consulta e gerenciador separados (seção 10) | P0 |
| I17 | Último acesso em minúscula | Template usa tempoRelativo diretamente | Capitalização local da célula | P2 |
| I18 | Melhorar Administração | Recursos importantes já existem em várias seções | Reorganizar por finalidade e acrescentar Dados | P1 |
| I19 | Configurações excessivamente visuais | Conta/segurança existem, mas apresentação ocupa várias abas | Priorizar conta e rotina operacional | P1 |
| I20 | Novas funcionalidades/abas | Há recursos existentes distribuídos | Priorizar Central de pendências | P2/P3 |

P0: corrigir significado ou função importante. P1: revisão principal. P2: melhoria complementar. P3: expansão opcional. Prioridade não equivale a dificuldade.

## 3. Modelo de informação: corrigir antes de redesenhar

### 3.1 Conceitos diferentes

| Conceito | Pergunta respondida | Fonte |
|---|---|---|
| Versão recebida | Qual versão foi aplicada ao sistema do cliente? | Cópia registrada no atendimento |
| Versão oficial | Qual versão deve ser aplicada em um atendimento novo? | Catálogo de versões oficiais |
| Tempo sem atendimento | Há quanto tempo não há atendimento registrado? | Data do último atendimento válido |

Exemplo: cliente atendido ontem com NFe 22/09 fica desatualizado quando a oficial passa para 24/09, mas não está há 60 dias sem atendimento. Cliente sem atendimento recente pode continuar em dia se nenhuma versão dos seus sistemas mudou.

### 3.2 Sistemas fixos — I04

Recomendação: atributo persistido no catálogo, por exemplo `controla_versao`, inicialmente falso para B_Atualizador e Suporte Bredas. O nome técnico deve acompanhar o esquema normalizado atual. Não espalhar listas independentes no cliente e no servidor.

- [x] Identificar ambos pelo cadastro canônico, aproveitando aliases já normalizados (`SistemaRepository.resolver`).
- [x] Criar migração idempotente, preservando IDs, vínculos e histórico (migração 2, `sistemas.controla_versao`).
- [x] Manter os sistemas fixos no cadastro de sistemas usados pelo cliente.
- [x] Excluir dos denominadores de cobertura de versões (card do Resumo).
- [x] Excluir do gráfico "Atualizações Por Sistema Este Mês" (`atualizadosNoMesPorSistema` filtra `controla_versao`).
- [x] Excluir de listas e contagens de clientes desatualizados por versão.
- [x] Excluir da seleção da aba Sistemas e da lista de referências oficiais (`/sistemas/versoes`).
- [x] Na ficha, apresentar em Serviços/componentes fixos, sem estado de atraso; a revisão geral da matriz continua em E7.
- [x] Não apagar atendimentos, anotações ou referências antigas já registradas.
- [x] Impedir na API que sistema fixo receba nova referência oficial por engano.
- [x] Desconsiderar referência antiga eventualmente cadastrada nesses sistemas; ao reclassificar como atualizável, a referência preservada volta a aparecer.
- [x] Não gerar lote de agendamentos de atualização por atraso desses sistemas; tarefa manual de instalação/acesso continua possível.
- [x] Reservar alteração da classificação de sistema à administração (aba Classificação, rota com papel `admin`).

Para volume de trabalho: um atendimento misto continua contando uma vez. Registro exclusivamente de instalação/acesso a componente fixo pode continuar no histórico de atendimentos, mas não deve inflar uma série chamada Atualizações de sistemas. Explicitar essa distinção no indicador.

**Feito em E2 (25/09/2026):** os totais e a tendência atuais do Resumo foram rotulados como **Atendimentos**, pois contam cada registro uma vez, inclusive os exclusivamente de componentes fixos. O gráfico **Atualizações Por Sistema Este Mês** lista somente sistemas atualizáveis. A definição e o tratamento dos meses vazios da tendência permanecem em E4 (5.3).

### 3.3 Situação consolidada do cliente

Grupos mutuamente exclusivos (decididos). **Cliente com B_Vendas é julgado só pelo B_Vendas** (decidido em 24/09/2026, depois de ver o card com dados reais: com todos os sistemas eram 21 em dia, 245 desatualizados e 103 pendentes, de 369). Sem B_Vendas, valem as regras abaixo sobre todos os sistemas:

1. **Desatualizado:** existe sistema atualizável com versão recebida **anterior** à oficial (ou, sem versão registrada, atendido antes da data da oficial).
2. **Verificação pendente:** não há atraso confirmado, mas algum sistema atualizável nunca teve atendimento, não tem oficial cadastrada ou tem data de atendimento inválida.
3. **Em dia:** possui ao menos um sistema atualizável e todos têm versão recebida **igual ou posterior** à oficial (ou, sem versão registrada, atendimento na data da oficial ou depois).
4. **Sem sistemas atualizáveis:** possui apenas fixos ou nenhum sistema; fica fora do denominador de cobertura.

Comparação por data, não por igualdade de texto. Hoje `matrizVersoes.js` usa `instalada === versaoAtiva`, o que marca como atrasado um cliente à frente da oficial (versão de teste, oficial rebaixada). Recebida posterior à oficial conta como Em dia. Versão em formato que não se converte em data é tratada como versão ausente (regra "pela data" abaixo).

**Fonte da versão recebida (decidido):** somente a versão registrada em atendimento. O que o agente reporta não entra na classificação; aparece separado, com origem identificada (ver 9.3). Hoje a ficha deixa o agente sobrepor o atendimento (`matrizVersoes.js`, `agente?.ultimaVersao || versaoRegistrada(...)`) e casa agente com cliente por CNPJ/nome; isso deixa de afetar a situação.

Nunca atualizado continua como detalhe por sistema. No consolidado, falta de evidência entra em Verificação pendente. Cliente com atraso confirmado e outro sistema sem informação conta uma vez em Desatualizado; a falta de informação aparece como detalhe secundário.

**Medido em 24/09/2026 (E0), numa cópia do banco de produção:** com a regra estrita, 21 desatualizados, 348 pendentes e 0 em dia, de 369 clientes. Havia 1.275 sistemas com atendimento sem versão, registrados antes de existir a versão oficial. **Decidido: atendimento sem versão é julgado pela data** do atendimento contra a data da oficial, marcado "(pela data)" na tela. A versão recebida continua "Não informada": nada é gravado retroativamente. A ação "confirmar versão atual" deixou de ser pré-requisito. Detalhes em `docs/adr/0008-situacao-de-versao-do-cliente.md`.

- [x] Compartilhar regra no servidor entre Resumo, Sistemas, situação do cliente e relatório do cliente (`services/situacaoVersao.js`).
- [ ] A matriz da ficha (`matrizVersoes.js`, aba Consultar Cliente) ainda compara com a versão publicada do agente usando `===`. Fica para a revisão da ficha (9.3).
- [x] Retornar totais de clientes, elegíveis e fora da avaliação.
- [x] Garantir soma correta, sem duplicar cliente com vários sistemas.
- [x] Usar IDs e relacionamentos normalizados atuais, sem novas junções por nome livre.
- [x] Aproveitar cópias de versões já existentes, sem mecanismo concorrente.
- [x] Comparar versões como datas; recebida posterior à oficial conta Em dia.
- [x] Classificar só pela versão do atendimento; agente fica fora da regra.
- [x] Testar oficial alterada, recebida à frente, formato não comparável, versões ausentes, vários sistemas, fixos e legados (`server/tests/situacaoVersao.test.js`).

## 4. Identidade visual e nome principal — I01

**Concluído em 24/09/2026.** Foram avaliadas duas propostas, Bredas Gestão e Gestor de Atualizações, aplicadas em barra, login e aba do navegador. A escolhida foi **Gestor de Atualizações**, com **Bredas Sistemas** como assinatura secundária.

O cabeçalho anterior misturava ATUALIZADOR e Gestor de clientes, deixando incerto se o produto era o agente automático, um cadastro ou uma central de operação.

- [x] Inventariar logo, favicon, login, sidebar, título do navegador e PDF. O PDF do relatório não usa marca e continua assim.
- [x] Preparar duas propostas em contexto real antes de substituir arquivos.
- [x] Definir símbolo simples e reconhecível em 16–32 px, vetorial.
- [x] Verificar reutilização: o conceito (setas + raio) foi mantido; o PNG não servia, porque tinha fundo escuro embutido.
- [x] Definir tipografia, proporção símbolo/nome, espaçamento e tamanho mínimo.
- [x] Usar uma cor principal (`--cor-accent`, que acompanha o realce escolhido).
- [x] Prever temas claro/escuro e sidebar aberta/recolhida.
- [x] Retirar descritor quando faltar espaço, sem distorcer logo ou cortar nome.
- [x] Atualizar nome, título do navegador e login de forma consistente.
- [x] Documentar as aplicações escolhidas (tabela abaixo).

### Aplicações da marca

| Onde | Como |
|---|---|
| Símbolo | `simboloMarca()` em `client/js/utils/icons.js`: SVG 32×32, traço 2.6, `currentColor`. Mesmo traçado em `assets/favicon.svg`; ao mudar um, mude o outro. |
| Quadrado do símbolo | Fundo `--cor-accent` e desenho `--cor-sobre-accent`, no CSS. Nunca fundo embutido no desenho. |
| Barra lateral aberta | Símbolo 34 px (desenho 24 px) + "Gestor de / Atualizações" em duas linhas, Sora extra 16 px. Sem descritor. |
| Barra recolhida | Só o símbolo. |
| Login (tela larga) | Símbolo 48 px, nome numa linha em `--txt-xl`, e a linha "Bredas Sistemas · Atualizações e atendimento dos clientes, num só lugar." |
| Login (celular) | Símbolo 44 px no cartão; subtítulo "Gestor de Atualizações". |
| Aba do navegador | "‹Tela› · Gestor de Atualizações"; `favicon.svg`, com `favicon.png` (64 px) como reserva e para as notificações. |
| O que não usar | "ATUALIZADOR" como nome do painel: é o nome do agente. |

Aceite: legibilidade em 390 px e desktop, sem deformação, fundo acidental, nome cortado ou assinaturas contraditórias.

## 5. Resumo e gráficos — I02, I03, I05

### 5.1 Situação dos clientes

Substituir a rosca genérica por um card **Atualização dos clientes**, com barra horizontal de distribuição e três totais clicáveis: Em dia, Desatualizados e Verificação pendente. Informar quantos clientes são elegíveis e quantos não participam da avaliação. O gráfico é auxiliar; os valores e ações precisam funcionar sem ele.

**Feito em 24/09/2026 (I02).** Cada total abre uma gaveta com a lista exata. Os nomes de sistema levam à aba Sistemas já filtrada.

- [x] Aplicar categorias da seção 3.3, em vez do prazo de 60 dias.
- [x] Mostrar número e percentual com denominador explícito.
- [x] Abrir lista com o mesmo filtro ao clicar em cada situação (as listas vêm na mesma resposta do `/resumo`).
- [x] Mostrar até três sistemas com mais clientes desatualizados e Ver todos.
- [ ] Estado vazio orientando conforme o problema. Hoje é uma mensagem única (sistemas nos clientes + oficial em Sistemas).
- [x] Não mostrar 100% em dia quando não houver clientes elegíveis.
- [x] Não misturar falha/offline de agente com versão registrada em atendimento.
- [x] Conferir que a população aberta pelo clique corresponde à contagem (verificado no navegador com dados sintéticos).

### 5.2 Sem atendimento há mais de 60 dias

- [x] Renomear indicador para **Sem atualização há mais de 60 dias** (a equipe preferiu "atualização" a "atendimento"), usando o prazo configurado, e o texto da regra na Administração.
- [x] Separar Nunca atendidos de clientes com atendimento antigo (vêm primeiro na lista, com "Nunca").
- [x] Corrigir destino do clique: hoje abre Sistemas sem reproduzir o conjunto contado.
- [x] Abrir lista com cliente, último atendimento e dias; responsável somente se houver fonte definida.
- [x] Remover fundo escuro arredondado do ícone de alerta.
- [x] Usar ícone simples e cor discreta, coerente com os demais indicadores.
- [x] Não tratar acompanhamento preventivo como falha crítica do sistema. Verificado: nenhuma palavra "falha"/"crítico" ligada ao indicador; o sino de notificações (`domain/notificacoes.js`) nem inclui "sem atualização" entre os avisos, só agendamentos atrasados e agentes.
- [x] Validar contraste, foco e leitura nos dois temas. Contraste calculado do valor vermelho contra o fundo do card: 6.17:1 (escuro) e 5.44:1 (claro), acima do mínimo de 4.5:1. Foco por teclado usa a regra global `::focus-visible`, sem reset em `.stat-tile`. Validação visual pixel a pixel fica para o E10 (sem ferramenta de navegador nesta etapa).

### 5.3 Tendência mensal

Achados no código: `LineChart.js` usa viewBox 640×240, margens fixas, até seis rótulos centrais e valor final com limite superior de posição. Esse limite pode aproximar o texto do ponto quando o valor chega ao topo. O SQL agrupa meses com registros e limita sua quantidade; não preenche explicitamente meses vazios. São causas candidatas, a confirmar visualmente com o cenário relatado.

- [ ] Definir 12 meses consecutivos até o mês corrente.
- [ ] Preencher meses sem registros com zero, sem saltos no calendário.
- [ ] Excluir datas futuras da série de realizados ou sinalizá-las para correção.
- [ ] Definir unidade: atendimentos de atualização ou clientes atendidos; não alternar silenciosamente.
- [ ] Acrescentar folga superior ao eixo para o maior valor.
- [ ] Alinhar os meses na mesma linha-base e na posição dos respectivos pontos.
- [ ] Ajustar âncoras nas extremidades para não cortar mês/ano.
- [ ] Adaptar quantidade de rótulos à largura real, não só à quantidade de pontos.
- [ ] Recomendação: tirar número final flutuante e mostrar o último total no cabeçalho; detalhes no tooltip.
- [ ] Se mantiver número sobre o gráfico, reservar área própria sem colisão com linha, grade e borda.
- [ ] Evitar curva que sugira valores negativos ou picos inexistentes; usar segmentos retos ou interpolação limitada.
- [ ] Oferecer tooltip por teclado/toque e leitura textual dos valores.
- [ ] Identificar mês corrente como parcial.
- [ ] Comparar percentuais somente entre períodos comparáveis; base zero não gera porcentagem infinita.

Aceite: 0, 1, 2, 6 e 12 meses; série zerada; máximo 121; máximo no primeiro/último ponto; zero alternado com picos; virada de ano; 390, 768, 1280 e 1440 px; sidebar aberta/recolhida.

## 6. Botões, tabelas e espaço — I06

- [ ] Definir variantes: primário, secundário com borda, perigo com borda e ação compacta com borda.
- [x] Retirar `btn--ghost` das ações que precisam se apresentar como botões, especialmente Excluir. Feito no E1 (escopo parcial do I06): 10 botões `btn--danger` que também tinham `btn--ghost` (Excluir em Clientes/Atualizações/Agendamentos, Encerrar sessão(ões), Restaurar tudo/backup, Remover acesso) — `btn--ghost` zerava a borda de `btn--danger` em repouso e disputava a cor do hover.
- [x] Manter borda perceptível em repouso, não apenas no hover. `btn--danger` sozinho já usa `--cor-borda-forte` em repouso; sem o `btn--ghost` por cima, a borda aparece.
- [x] Distinguir ação destrutiva por rótulo e cor, não só por ícone. Já valia (rótulo + `btn--danger`); confirmado que nenhum desses botões dependia só do ícone `alerta`.
- [ ] Padronizar altura, raio, espessura do traço e distância ícone/texto.
- [ ] Revisar linhas, formulários, modais e rodapés; evitar substituição global cega.
- [ ] Manter nome acessível e dica para ícones sem texto.
- [ ] Padronizar desabilitado, processamento e foco por teclado.
- [ ] Reduzir peso visual sem reduzir excessivamente alvo de toque.
- [ ] Alinhar início das grades nas abas operacionais.
- [ ] Conferir largura aproveitada e equilíbrio à direita com sidebar recolhida.

Aceite: botões reconhecíveis em claro/escuro, sem deslocamento no hover. Menus e navegação não devem receber indevidamente estilo de botão de formulário.

## 7. Atualizações — I07, I08, I09

### 7.1 Filtros de data

Toolbar proposta: `Buscar | Responsável | Filtros (n) | Relatórios | Mais ações | + Nova atualização`.

- [ ] Recolher De/Até e atalhos de período em Filtros.
- [ ] Exibir chip do período aplicado mesmo quando o painel estiver fechado.
- [ ] Fechar filtros não deve limpar o recorte.
- [ ] Manter Limpar filtros e contagem de resultados acessíveis.
- [ ] Preservar preferências existentes de filtros e período inicial.
- [ ] Validar intervalo invertido, data incompleta, limpeza e aplicação.
- [ ] Não consultar silenciosamente um recorte inválido enquanto a pessoa digita.
- [ ] Lista, relatório e exportação devem usar o mesmo conjunto completo, não só a página.
- [ ] Em tela pequena, acomodar controles em linhas claras sem empurrar a grade por excesso de ações secundárias.

### 7.2 Importar e exportar planilha

Recomendação: **Exportar resultado (.xlsx)** em Mais ações da lista; **Importar planilha** em fluxo dedicado de Dados, acessível pela Administração e por entrada discreta quando o papel permitir.

Hoje operadores podem importar. Mover exclusivamente para Administração pode retirar uma permissão existente. Recomendação inicial: preservar autorização atual por entrada restrita ao fluxo de Dados, sem conceder acesso completo à Administração. Se a intenção for tornar importação exclusiva de admin, essa mudança precisa ser explícita.

- [ ] Criar menu Mais ações com teclado, Escape e restauração de foco.
- [ ] Manter exportação perto dos filtros e sem privilégios novos para quem já consulta.
- [ ] Indicar recorte e usar nome de arquivo identificável.
- [ ] Mover importação para fluxo com orientação do formato aceito.
- [ ] Evolução: prévia com linhas válidas, erros e possíveis duplicidades.
- [ ] Não aplicar versão oficial atual retroativamente a importações históricas.
- [ ] Diferenciar erro de arquivo, coluna, data e cliente desconhecido.
- [ ] Confirmar aplicação após prévia, com resultado no Histórico.
- [ ] Planejar transação e recuperação de falha do lote.

A prévia da importação pode ser entrega posterior: reposicionar botões não precisa esperar a ampliação de todo o importador.

### 7.3 Tela dos relatórios

Relatório por período, cópia, impressão/PDF e Excel formatado já existem. Melhorar acesso e apresentação, sem reconstruir recursos equivalentes.

- [ ] Trocar select por abas curtas: Atendimento e Cliente.
- [ ] Período permanece entrada própria, utilizável sem selecionar um cliente.
- [ ] Não oferecer Atendimento sem registro selecionado.
- [ ] Cabeçalho informa contexto e oferece fechar de forma discreta.
- [ ] Prévia rolável com rodapé estável: Copiar e Imprimir/Salvar PDF.
- [ ] Filtro de histórico somente na aba Cliente, recolhido inicialmente.
- [ ] Diferenciar Situação atual de Histórico no período; o filtro não representa uma situação histórica reconstruída.
- [ ] Reduzir repetição de títulos, caixa alta e espaços vazios.
- [ ] Sistemas em tabela no desktop e blocos no celular, sem cortar informações.
- [ ] Texto para copiar permanece simples, sem alinhamento manual com espaços.
- [ ] PDF multipágina não pode cortar conteúdo nem incluir navegação e botões.
- [ ] Copiar apresenta sucesso sem obrigatoriamente fechar o relatório.
- [ ] Não reintroduzir campos retirados do chamado.

Formato obrigatório do chamado:

```text
ATUALIZAÇÃO — 24/09/2026

Cliente: Mercado Central
Sistemas: B_Vendas, B_NFe
B_Vendas: 09/09/2026 (anterior: 17/08/2026)
B_NFe: 22/09/2026 (anterior: 15/09/2026)
Máquinas: 3
Por: Antonio
Obs: Sistemas atualizados no servidor e nos dois caixas.
Realizados testes de venda e emissão de nota fiscal.
```

Aceite: sem ID, código, cidade ou motivo; versão anterior apenas quando conhecida e diferente; observação conserva quebras de linha; alteração de oficial não reescreve relatório antigo.

## 8. Agendamentos — I10, I11, I12

Toolbar junto à grade: `Buscar | Responsável | Status | Filtros | + Novo agendamento`.

Abaixo, filtros rápidos discretos: Minhas tarefas, Hoje, Atrasadas e Arquivadas. Lista é o padrão recomendado; Kanban existente permanece alternativa, compartilhando dados e regras.

- [ ] Remover faixa superior usada apenas pelo botão de criação.
- [ ] Mover criação para toolbar com tamanho secundário e borda.
- [ ] Alinhar início da grade com Clientes e Atualizações.
- [ ] Padronizar busca, filtros e paginação.
- [ ] Destacar cliente/tarefa; responsável, prazo e status legíveis na linha.
- [ ] Destacar alta/urgente sem selos excessivos para prioridade normal.
- [ ] Expor edição, conclusão e arquivamento conforme estado.
- [ ] Reaproveitar prioridades, horários, responsáveis, observações e Kanban existentes.
- [ ] Garantir contagens e conjuntos corretos nos filtros rápidos.

### 8.1 Remover conversão

- [x] Remover Converter do formulário, menus de linha, comandos e dicas.
- [x] Localizar chamadores antes de retirar handlers e método sem uso.
- [x] Manter cadastro de atualização independente do agendamento.
- [x] Remover instruções antigas de conversão da documentação.
- [x] Testar que concluir tarefa não cria atualização nem altera versão de cliente.

### 8.2 Recuperar arquivamento manual

A regra atual permite arquivar tarefa concluída. Preservá-la nesta entrega; permitir arquivar pendentes seria outra decisão de negócio.

- [x] Mostrar Arquivar no cartão concluído e no formulário correspondente.
- [x] Não oferecer ação inválida em tarefa pendente; explicar quando necessário.
- [x] Reutilizar rota existente, com retorno claro de sucesso ou erro.
- [x] Retirar da lista ativa sem apagar histórico.
- [x] Manter acesso a Arquivadas mesmo com contagem zero.
- [x] Diferenciar Desarquivar de Reabrir: a operação existente também muda o status para A Fazer.
- [x] Preservar arquivamento automático e sua configuração administrativa.
- [x] Testar Kanban, filtro Arquivadas e papéis admin/operador/consulta (cartão e autorização da rota). A tela atual não tem lista tabular; a reorganização da grade fica para E6.

Melhorias posteriores: reagendamento com motivo, lembrete de retorno e checklist de execução. Recorrência e calendário mensal ficam fora da primeira entrega por exigirem regras de série, duplicação e vencimento.

## 9. Clientes e Consulta — I13, I14, I15

### 9.1 Acessos na linha

- [ ] Retirar Acessos da toolbar global.
- [ ] Acrescentar Gerenciar acessos diretamente na linha de cada cliente.
- [ ] Manter Copiar acessos separado: a ação atual de cópia não substitui a gestão.
- [ ] Usar menu de linha quando ficha, acessos, edição e exclusão não couberem.
- [ ] Passar o ID da linha para a ação, sem depender de seleção prévia.
- [ ] Evitar propagação do clique que abra simultaneamente o formulário.
- [ ] Preservar restrições de usuários de consulta.

### 9.2 Grupo/Rede

- [ ] Priorizar largura do nome do cliente.
- [ ] Limitar coluna Grupo/Rede com quebra controlada ou reticências e leitura completa acessível.
- [ ] Compactar campo no formulário, agrupando com Código/Cidade quando couber.
- [ ] No celular, manter rótulo e conteúdo legíveis em disposição vertical.
- [ ] Não criar selo ou bloco chamativo para valor vazio.
- [ ] Preservar busca por grupo, autocomplete e dados existentes.

### 9.3 Ficha do cliente

Cadastro, Sistemas e Acessos já existem como subabas. O foco deve ser hierarquia, consistência e informação útil.

- [ ] Cabeçalho com nome, código e cidade; grupo apenas quando preenchido.
- [ ] Remover CNPJ do subtítulo e dos campos da ficha.
- [ ] Não remover identificação por CNPJ dos agentes em Distribuição: é outro uso.
- [ ] Resumo compacto: último atendimento, sistemas desatualizados e informação pendente.
- [ ] Compartilhar comparação de versões com Sistemas e relatório do cliente.
- [ ] Separar componentes fixos dos sistemas atualizáveis.
- [ ] Não confundir versão publicada do agente com oficial do histórico operacional.
- [ ] Quando houver dados do agente, mostrar em bloco próprio (versão reportada, último contato, falha), sem alterar a situação do sistema, que vem só do atendimento (3.3).
- [ ] Histórico cronológico com observações expansíveis e relatório do atendimento.
- [ ] Acrescentar próximos agendamentos se puder reutilizar consulta existente; caso contrário, entregar depois.
- [ ] Acessos por máquina em lista compacta com cópia individual.
- [ ] Estados vazios curtos, sem vários campos preenchidos com travessões.
- [ ] Preservar seleção e pesquisa ao voltar da ficha.

Aceite: nome longo, sem grupo, sem sistemas, apenas fixos, sem histórico, vários acessos e histórico extenso.

## 10. Sistemas e versões oficiais — I16

Recomendação: não deixar dois campos de data permanentes. Separar consulta e manutenção.

Toolbar: `Sistema | Situação | Buscar cliente | Filtros | Versões oficiais`.

Abaixo, referência de leitura: `Versão oficial de B_NFe: 22/09/2026`. Edição dentro de Versões oficiais.

### 10.1 Consulta

- [x] Situação: Todos, Em dia, Desatualizados, Sem informação.
- [x] Busca por cliente/cidade sem alterar versão.
- [x] Oferecer Último atendimento antes de em Filtros, com data opcional. Sem atendimento fica fora desse recorte de data; aparece em Sem informação quando não há data aplicada.
- [x] A data filtra o atendimento; não substitui a oficial usada na classificação de versão.
- [x] Retirar ambiguidade atual: a consulta não tem ação de salvar referência.
- [x] Colunas: Cliente, Último atendimento, Versão recebida, Oficial e Situação; cidade secundária.
- [x] Abrir ficha na linha para investigar pendência.
- [x] Excluir fixos da seleção principal de controle.
- [x] Preservar filtros ao voltar, buscando a referência oficial atual a cada entrada.

### 10.2 Gerenciador de oficiais

- [x] Uma linha por sistema atualizável, com versão salva.
- [x] Mostrar autor/data da alteração quando disponíveis; duas colunas novas passam a registrar alterações futuras, e referências antigas mostram autor/data não registrados.
- [x] Edição explícita por linha com Salvar/Cancelar e validação de data.
- [x] Explicar: novos atendimentos usam a oficial; os existentes preservam versões recebidas.
- [x] Referência ausente não implica Em dia (`Sem referência` no servidor).
- [x] Preservar papéis atuais de gravação; consulta apenas visualiza.
- [x] Invalidar os dados locais de Resumo, Sistemas, Consulta e relatórios após mudança.
- [x] Detectar edição concorrente antes de sobrescrever uma oficial alterada por outra pessoa (comparação atômica com a referência anterior; HTTP 409).
- [x] Fechar painel ou trocar seleção não grava alterações.

Aceite: filtro nunca grava; salvar não reescreve atendimento; sistemas aceitam oficiais diferentes; limpar oficial não torna todos os clientes atualizados.

**Validado em E3 (25/09/2026):** testes de API cobrem autoria, referência anterior obrigatória e conflito HTTP 409; os testes de serviço cobrem filtro de atendimento sem substituir a oficial e preservação da versão recebida. No navegador, em 1280 e 390 px, o filtro não enviou PUT, a edição atualizou a referência mostrada, não houve erro de JavaScript nem rolagem horizontal.

## 11. Usuários e Administração — I17, I18

### 11.1 Último acesso

- [x] Renderizar Hoje, Ontem e Há 2 dias com inicial maiúscula na célula.
- [x] Manter data/hora completa no detalhe acessível.
- [x] Preservar Nunca entrou quando não houver login.
- [x] Alterar apresentação local, sem capitalizar todas as frases de `tempoRelativo()` usadas em textos corridos.

### 11.2 Organização por finalidade

| Seção proposta | Conteúdo | Situação |
|---|---|---|
| Pessoas e permissões | Usuários, papéis e ações de conta | Existe; reorganizar |
| Operação | Prazos, arquivamento, classificação dos sistemas | Parte existe; ampliar |
| Dados | Importação, exportações administrativas e validações | Nova organização; fluxos parcialmente existentes |
| Integrações | Atualizador, alertas externos, URL do painel | Recursos já distribuídos |
| Backups e recuperação | Cópias, retenção, restauração | Existe |
| Auditoria | Histórico de alterações e filtros | Existe |
| Diagnóstico | Saúde e falhas relevantes do servidor | Existe |

- [ ] Reduzir descrições longas e cabeçalhos repetidos.
- [ ] Mostrar estado resumido sem buscar diagnóstico pesado ao abrir Usuários.
- [ ] Identificar formulários que afetam toda a equipe.
- [ ] Salvar por formulário/seção com indicação de alterações pendentes.
- [ ] Proteger contra perda de edição ao sair da seção.
- [ ] Manter segredos mascarados e fora do Histórico.
- [ ] Não transformar infraestrutura e segredos de implantação em preferências pessoais.
- [ ] Reaproveitar auditoria existente, sem outra lista de histórico concorrente.
- [ ] Backup saudável precisa considerar verificação, não só existência de arquivo.
- [ ] Ações de restauração/exclusão permanecem em seu contexto, com consequência clara.
- [ ] Autorizar na API, além de esconder controles na tela.

## 12. Configurações para a rotina — I19

Nome, senha, sessões, pesquisa e restauração por seção já existem. O problema é prioridade e organização: várias abas cuidam de como a tela parece, em vez de como a pessoa trabalha.

**Escopo da primeira entrega (decidido): só reorganizar o que já existe.** Nenhuma preferência ou notificação nova. O mesmo vale para a Administração (11.2): reagrupar seções existentes; Dados reúne fluxos que já existem (importação, exportações).

| Grupo | Conteúdo | Escopo |
|---|---|---|
| Minha conta | Nome, senha, sessões e sair dos outros aparelhos | Pessoal |
| Trabalho diário | Preferências já existentes de tela inicial, filtros, lista/Kanban e linhas por página | Pessoal |
| Notificações | Controles já existentes, sem novos tipos de evento | Pessoal |
| Interface/acessibilidade | Tema, densidade, texto, movimento, contraste e foco | Pessoal |
| Regras da equipe | Link para Administração; não duplicar formulários | Global/admin |
| Sobre e ajuda | Versão do painel, atalhos e significado das situações | Informativo |

- [ ] Abrir em Minha conta ou Trabalho diário, não num catálogo de temas.
- [ ] Recolher personalizações avançadas em subseção.
- [ ] Manter tema, texto, densidade e acessibilidade fáceis de encontrar.
- [ ] Reavaliar destaque de fonte, fundo decorativo, perfis visuais e largura ajustável.
- [ ] Reaproveitar busca e restauração por seção.
- [ ] Identificar ajuste pessoal versus global quando houver risco de confusão.
- [ ] Preservar valores já salvos ao mover opções de lugar.
- [ ] Testar restauração e conta sem acesso administrativo.

Ficam para evolução (seção 13.5): novos tipos de notificação, som, horário silencioso, preferências de relatório/exportação, responsável padrão, persistência de preferências por usuário no servidor e sincronização entre navegadores.

Segurança futura: encerramento por inatividade administrável e autenticação em dois fatores podem ser úteis, mas exigem servidor, recuperação e testes próprios. Não são apenas controles novos na interface e ficam fora da primeira revisão visual.

## 13. Sugestões de evolução — I20

### 13.1 Central de pendências — primeira recomendação

Pergunta: **o que a equipe precisa resolver agora?**

Reunir clientes desatualizados, referências oficiais ausentes, versões recebidas desconhecidas e agendamentos atrasados. Falhas de agentes podem aparecer como categoria própria, com origem identificada.

- [ ] Cada pendência tem tipo, cliente/sistema, idade e ação para sua origem.
- [ ] Responsável somente quando houver atribuição real.
- [ ] Filtros Minhas pendências, Equipe, Tipo e Sistema.
- [ ] Contagens deduplicadas, sem copiar registros para uma tabela paralela desnecessária.
- [ ] Resolver na origem retira automaticamente a pendência.
- [ ] Criar agendamento por ação explícita, evitando duplicatas.
- [ ] Não apresentar informação ausente como falha confirmada.

Depende da classificação correta e da revisão de Agendamentos. A primeira versão pode ser uma lista acessível pelo Resumo; promover a aba permanente quando o volume e uso justificarem.

### 13.2 Campanhas de atualização — segunda etapa

Pergunta: **como acompanhar um conjunto de clientes para uma versão específica?**

- [ ] Selecionar sistema, versão-alvo e clientes.
- [ ] Preservar versão-alvo da campanha quando outra oficial for cadastrada.
- [ ] Mostrar pendentes, atendidos e impedimentos.
- [ ] Reaproveitar agendamentos para execução e atendimentos para comprovação.
- [ ] Definir se receber versão posterior conclui campanha; não presumir ordenação de textos/datas sem regra.
- [ ] Evitar duplicar publicação automática de pacotes em Versões/Distribuição.

Requer entidade e regras novas. Entregar depois de validar a Central de pendências.

### 13.3 Relatórios gerenciais

Uma aba dedicada pode reunir período, cliente, sistema e responsável, com filtros salvos. Hoje relatórios já existem nas telas: primeiro melhorar consistência e acesso. Criar aba somente quando houver cruzamentos recorrentes que o modal não comporte.

### 13.4 Qualidade dos cadastros

Recomendação: seção em Dados, não nova aba principal. Listar clientes sem sistemas, atendimentos sem versão, sistemas sem oficial e possíveis duplicidades. Correção deve mostrar os registros envolvidos; não consolidar ou excluir automaticamente por semelhança de nomes.

### 13.5 Preferências e notificações — adiadas da seção 12

- [ ] Tipos de evento, minhas tarefas/equipe, som opcional; não oferecer opção que não altere comportamento real.
- [ ] Horário silencioso: definir fuso, eventos críticos e mensagens acumuladas.
- [ ] Estado real da permissão de notificação de desktop, inclusive bloqueio.
- [ ] Preferências de relatório sem reintroduzir campos removidos do chamado; o chamado não vira editor livre.
- [ ] Persistência por usuário no servidor, validação de chaves e migração das preferências locais.
- [ ] Não acrescentar idioma/fuso decorativos sem suporte integral nas datas e relatórios.

### Fora da prioridade atual

Chat interno, CRM completo, financeiro, grande editor de dashboards e automações sem revisão. Aumentariam escopo antes de resolver os problemas operacionais identificados.

## 14. Sequência de execução

Numeração única: as etapas abaixo são a ordem de execução e cada uma é uma entrega verificável. Esforços são relativos, não prazos: migrações e permissões precisam estar consolidadas antes de estimar horas/dias com confiança. A marca (E9) já foi aplicada antes da ordem prevista; se E5 mudar o padrão de botões ou da barra lateral, conferir de novo a tabela "Aplicações da marca" da seção 4.

| Etapa | Entrega | Pedidos | Dependência | Esforço |
|---|---|---|---|---|
| E0 | ✅ Contagem real por grupo da 3.3 (24/09/2026). Capturas "antes" ainda por fazer | — | — | Pequeno |
| E1 | ✅ Correções rápidas e independentes (25/09/2026); navegador conferido em 390/1280 px, revisão visual completa segue em E10 | I05, I06 (só Excluir e ações sem borda), I11, I12, I17 | — | Pequeno |
| E2 | ✅ Regra de versão e classificação dos componentes fixos concluídas (25/09/2026); revisão geral da ficha permanece em E7 | I04, I02 (regra) | E0 | Grande |
| E3 | ✅ Oficiais separadas dos filtros em Sistemas (25/09/2026) | I16 | E2 | Médio |
| E4 | ◐ Card de situação e Sem atendimento feitos; falta a tendência | I02, I03 | E2 | Médio |
| E5 | Padrão de botões e toolbars; Atualizações com filtros recolhíveis e planilhas reposicionadas | I06, I07, I08 | E1 | Médio |
| E6 | Agendamentos (toolbar, filtros rápidos) e Clientes (acessos na linha, Grupo/Rede) | I10, I13, I14 | E5 | Médio |
| E7 | Ficha do cliente e relatórios | I09, I15 | E2, E5 | Médio |
| E8 | Administração e Configurações (só reorganizar) | I18, I19 | — | Médio |
| E9 | ✅ Identidade escolhida e aplicada (antecipada, 24/09/2026) | I01 | — | Médio |
| E10 | Validação visual completa, README/ajuda, CHANGELOG | — | Todas | Pequeno |
| E11 | Central de pendências, em entrega independente | I20 | E2, E4, E6 e uso real | Grande; opcional |

E0 mostrou que Verificação pendente concentraria 348 de 369 clientes. A saída decidida foi julgar pela data o atendimento sem versão (3.3), e não criar a ação de confirmar versão.

### Checklist mestre

- [x] E0 — contagem por grupo com dados reais (24/09/2026).
- [x] E1 — alerta sem fundo escuro, borda em Excluir, remover Converter, recuperar Arquivar, Último acesso capitalizado.
- [x] E2 — `controla_versao`, exclusões dos fixos, classificação só por admin, comparação por data, fonte só atendimento e regra única no servidor; ADR-0008. Validados API, histórico e gráfico mensal.
- [x] E3 — consulta com filtros próprios e gerenciador de oficiais separado, com autoria e proteção contra edição concorrente.
- [ ] E4 — Resumo feito (card e Sem atendimento, com clique e indicador na mesma população); falta a tendência (I03).
- [ ] E5 — variantes de botão, toolbars, filtros de data recolhíveis, exportar/importar reposicionados.
- [ ] E6 — Agendamentos junto à grade; acessos na linha; Grupo/Rede compacto.
- [ ] E7 — ficha sem CNPJ, agente em bloco próprio; relatórios em abas com o texto aprovado.
- [ ] E8 — Administração e Configurações reagrupadas, sem preferências novas.
- [x] E9 — identidade escolhida e aplicada (antecipada; 24/09/2026).
- [ ] E10 — validação completa e documentação.
- [ ] E11 — Central de pendências.

## 15. Validação e critérios gerais de aceite

### Regras e dados

- [ ] NFe recebido em 22/09 fica atrasado após oficial 24/09 sem reescrever histórico.
- [ ] Novo atendimento recebe a oficial; editar observação preserva a recebida.
- [ ] Cliente somente com fixos não entra na fila nem no denominador de versões.
- [ ] Cliente com vários sistemas conta uma vez na situação consolidada.
- [ ] Informação ausente não produz Em dia.
- [ ] Recebida posterior à oficial conta Em dia; formato não comparável vai para Verificação pendente.
- [ ] Versão reportada pelo agente não altera a situação do cliente.
- [ ] Tempo sem atendimento não altera situação de versão.
- [ ] Meses vazios aparecem; clique e indicador têm a mesma população.
- [ ] Exportação e relatório incluem todas as páginas do recorte.
- [ ] Alteração no catálogo invalida telas afetadas, preservando atendimentos.
- [ ] Migrações preservam vínculos, são idempotentes e têm recuperação documentada.

### Interação

- [ ] Filtrar nunca grava oficial; fechar painel não aplica edição.
- [ ] Fechar filtro mantém recorte; Limpar remove recorte e chips.
- [ ] Arquivar concluída funciona e ela pode ser encontrada depois.
- [ ] Converter não aparece em nenhum caminho de Agendamentos.
- [ ] Acessos abre no cliente correto; copiar é ação separada.
- [ ] Opções de Configurações movidas de lugar mantêm os valores já salvos.
- [ ] Falha de rede, sessão expirada e conflito não produzem sucesso falso.
- [ ] Importação falha não deixa alteração parcial sem resultado explícito.

### Visual e acessibilidade

- [ ] Nas etapas intermediárias: 390 px e desktop, tema claro e escuro.
- [ ] Em E10: 390, 768, 1280 e 1440 px, zoom 200%, sidebar aberta/recolhida.
- [ ] Conferir temas claro/escuro e contraste elevado disponível.
- [ ] Conferir bordas, foco, desabilitados, teclado e alvos de toque.
- [ ] No celular, informação essencial não depende de tabela cortada: usar resumo, blocos ou expansão quando necessário.
- [ ] Gráfico não corta meses, valor nem tooltip e oferece leitura textual.
- [ ] Modal permite alcançar rodapé por teclado, sem rolagem horizontal.
- [ ] PDF multipágina sem sidebar, controles ou conteúdo cortado.
- [ ] Nomes longos, observações multilinha e caracteres HTML seguros e legíveis.

### Engenharia e entrega

- [ ] Revalidar estado dos arquivos antes de editar e preservar alterações alheias.
- [ ] Rodar `npm run check`, `npm test` e `git diff --check` a partir de `web` ao fim de cada etapa.
- [ ] Cobrir regras e autorização das APIs de sistemas, importação e arquivamento.
- [x] ADR para a situação consolidada e `controla_versao`: `docs/adr/0008-situacao-de-versao-do-cliente.md`, listado na seção 4 de `DOCUMENTACAO_CONSOLIDADA.md`.
- [ ] CHANGELOG a cada etapa com mudança visível.
- [ ] Testar navegador com banco descartável e dados representativos.
- [ ] Registrar antes/depois: sintaxe e testes automatizados não comprovam aparência.
- [ ] Testar papéis admin, operador e consulta.
- [ ] Atualizar README e ajuda, removendo instruções antigas de conversão/filtros.
- [ ] Documentar banco e reinício necessário; não reiniciar produção automaticamente durante validação.

## 16. Mapa técnico

| Área | Pontos de entrada |
|---|---|
| Marca | `client/js/app/App.js`, `client/index.html`, `client/assets/`, `client/css/theme.css` |
| Padrões | `client/css/components.css`, `SortableTable.js`, `Drawer.js`, `Modal.js` |
| Resumo/gráficos | `ResumoView.js`, `components/charts/LineChart.js`, `BarChart.js`, `PieChart.js`, `domain/resumo.js` |
| Indicadores | `server/src/services/AtualizacaoService.js`, `server/src/database/AtualizacaoRepository.js` |
| Sistemas | `SistemasView.js`, `SistemaRepository.js`, `ClienteService.js`, `SistemasController.js` |
| Relatórios | `AtualizacoesView.js`, `components/RelatorioModal.js`, `domain/relatorio.js` |
| Agendamentos | `AgendamentosView.js`, `templates/agendamentos.js`, `AgendamentoService.js`, `AgendamentoRepository.js` |
| Clientes/Consulta | `ClientesView.js`, `ConsultaView.js`, `AcessosModal.js`, `domain/matrizVersoes.js` |
| Administração | `AdministracaoView.js`, `views/administracao/`, `templates/administracao.js` |
| Configurações | `ConfiguracoesView.js`, `views/configuracoes/ajustes.js`, `ContaConfig.js`, `app/appearance.js` |
| Regras/banco | `server/src/config/regrasEquipe.js`, `ConfiguracaoSistemaService.js`, `Database.js`, migrações atuais |
| Testes | `client/tests/`, `server/tests/` e navegador com dados descartáveis |

Colunas e contratos devem seguir a normalização atual. Este mapa aponta investigação; não autoriza substituir mudanças recentes por arquivos de versões anteriores.

## 17. Decisões para revisão nas etapas correspondentes

### Decididas (24/09/2026)

| Decisão | Resultado |
|---|---|
| Recebida mais nova que a oficial | Em dia; desatualizado só quando anterior à oficial |
| Fonte da versão para a situação | Só o atendimento; agente aparece separado |
| Escopo de Configurações/Administração | Só reorganizar; novidades em 13.5 |
| Central de pendências | Mantida como E11, opcional e independente |
| Nome/símbolo | Gestor de Atualizações, assinatura Bredas Sistemas; símbolo vetorial (seção 4) |
| Atendimento sem versão registrada | Julgado pela data do atendimento contra a da oficial, marcado "(pela data)" (ADR-0008) |
| Quem decide a situação do cliente | O B_Vendas, quando o cliente tem (fixo no código); sem ele, todos os sistemas |
| Nome do indicador de tempo | "Sem atualização há mais de N dias" (não "atendimento") |
| Sistemas fixos agora | Classificação, exclusões, tela administrativa e API concluídas em E2 |

### Em aberto

Não impedem as correções objetivas. Resolver cada uma quando afetar a entrega, apresentando proposta concreta para visualizar.

| Decisão | Recomendação inicial |
|---|---|
| Situação no Resumo | Barra e totais clicáveis, substituindo rosca; depende da contagem de E0 |
| Sistemas fixos | Classificação no catálogo, administrável |
| Arquivar pendente | Manter apenas concluídas nesta entrega |
| Importação de operador | Preservar permissão com entrada discreta |
| Datas em Sistemas | Filtro recolhível e gerenciador separado |

O resultado esperado é um painel mais útil, com menos ambiguidade. Novas abas vêm depois de indicadores, filtros e ações principais representarem corretamente o trabalho da equipe.
