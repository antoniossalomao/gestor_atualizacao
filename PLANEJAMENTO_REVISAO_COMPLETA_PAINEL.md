# Planejamento completo de revisão do painel web

Data: 24/09/2026  
Situação: proposta para revisão; implementação não iniciada por este planejamento.  
Escopo: identidade, indicadores, tabelas, relatórios, agendamentos, clientes, sistemas, usuários, administração, configurações e evolução do produto.

## 1. Objetivo e limites da análise

Tornar o painel mais coerente com a operação: saber quem precisa de atualização, organizar atendimentos e produzir relatórios úteis, com menos controles disputando atenção.

A análise foi feita sobre o código atual das telas, componentes, serviços e repositórios. As observações visuais do usuário são requisitos deste plano. O desalinhamento dos meses, o número 121 e a aparência do ícone precisam ser reproduzidos no navegador durante a execução: nesta etapa não houve nova inspeção visual de todas as telas nem consulta ao banco de produção para confirmar esse valor.

Há alterações em andamento no workspace, inclusive normalização dos relacionamentos de clientes, sistemas e atualizações e migrações do banco. A execução deverá partir do estado consolidado dessas alterações, sem sobrescrevê-las nem reconstruir o modelo antigo. Os documentos anteriores de planejamento não foram localizados pelos padrões pesquisados na árvore atual; este documento não presume que seus itens antigos ainda estejam pendentes.

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
| I01 | Logo e nome sem identidade | Cabeçalho usa ATUALIZADOR / Gestor de clientes | Consolidar nome, assinatura e aplicações da marca | P1 |
| I02 | Situação dos clientes pouco útil | Em dia é calculado pelo complemento de clientes sem atualização recente | Separar versão de tempo sem atendimento | P0 |
| I03 | Tendência desalinhada | SVG com margens fixas e rótulo final junto ao ponto | Corrigir calendário, eixos, margens e rótulos | P1 |
| I04 | Sistemas fixos aparecem nos indicadores | Catálogo contém ambos, sem política explícita central de exclusão | Classificar sistemas sujeitos a versão | P0 |
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
| I16 | Separar filtro e versão oficial | Mesmo campo consulta ao digitar e grava ao salvar | Gerenciador de oficiais separado dos filtros | P0 |
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

- [ ] Identificar ambos pelo cadastro canônico, aproveitando aliases já normalizados.
- [ ] Criar migração idempotente, preservando IDs, vínculos e histórico.
- [ ] Manter os sistemas fixos no cadastro de sistemas usados pelo cliente.
- [ ] Excluir dos gráficos por sistema e dos denominadores de cobertura de versões.
- [ ] Excluir de listas e contagens de clientes desatualizados por versão.
- [ ] Excluir da seleção padrão da aba Sistemas e do gerenciador de versões oficiais.
- [ ] Na ficha, apresentar em Serviços/componentes fixos, sem estado de atraso.
- [ ] Não apagar atendimentos, anotações ou referências antigas já registradas.
- [ ] Impedir na API que sistema fixo receba nova referência oficial por engano.
- [ ] Desconsiderar referência antiga eventualmente cadastrada nesses dois sistemas.
- [ ] Não gerar agendamento de atualização por atraso desses sistemas.
- [ ] Reservar alteração da classificação de sistema à administração.

Para volume de trabalho: um atendimento misto continua contando uma vez. Registro exclusivamente de instalação/acesso a componente fixo pode continuar no histórico de atendimentos, mas não deve inflar uma série chamada Atualizações de sistemas. Explicitar essa distinção no indicador.

### 3.3 Situação consolidada do cliente

Proposta de grupos mutuamente exclusivos:

1. **Desatualizado:** existe sistema atualizável com versão recebida conhecida diferente da oficial conhecida.
2. **Verificação pendente:** não há atraso confirmado, mas falta versão recebida ou referência oficial em algum sistema atualizável.
3. **Em dia:** possui ao menos um sistema atualizável e todos têm versão recebida correspondente à oficial.
4. **Sem sistemas atualizáveis:** possui apenas fixos ou nenhum sistema; fica fora do denominador de cobertura.

Nunca atualizado continua como detalhe por sistema. No consolidado, falta de evidência entra em Verificação pendente. Cliente com atraso confirmado e outro sistema sem informação conta uma vez em Desatualizado; a falta de informação aparece como detalhe secundário.

- [ ] Compartilhar regra no servidor entre Resumo, Sistemas, Consulta e relatórios.
- [ ] Retornar totais de clientes, elegíveis e fora da avaliação.
- [ ] Garantir soma correta, sem duplicar cliente com vários sistemas.
- [ ] Usar IDs e relacionamentos normalizados atuais, sem novas junções por nome livre.
- [ ] Aproveitar cópias de versões já existentes, sem mecanismo concorrente.
- [ ] Testar oficial alterada, versões ausentes, vários sistemas, fixos e legados.

## 4. Identidade visual e nome principal — I01

Direção recomendada para avaliação: **Bredas Gestão**, com descritor **Atualizações e atendimento**. Alternativa próxima do nome atual: **Gestor de Atualizações**, com Bredas como assinatura secundária. São propostas; a escolha de marca não está aprovada.

O cabeçalho atual mistura ATUALIZADOR e Gestor de clientes, deixando incerto se o produto é o agente automático, um cadastro ou uma central de operação.

- [ ] Inventariar logo, favicon, login, sidebar, título do navegador e PDF.
- [ ] Preparar duas propostas em contexto real antes de substituir arquivos.
- [ ] Definir símbolo simples e reconhecível em 16–32 px, preferencialmente vetorial.
- [ ] Verificar se os arquivos atuais permitem reutilização antes de produzir uma marca nova.
- [ ] Definir tipografia, proporção símbolo/nome, espaçamento e tamanho mínimo.
- [ ] Usar uma cor principal; reservar cores de alerta para estados operacionais.
- [ ] Prever temas claro/escuro e sidebar aberta/recolhida.
- [ ] Retirar descritor quando faltar espaço, sem distorcer logo ou cortar nome.
- [ ] Atualizar nome acessível, título do navegador e login de forma consistente.
- [ ] Documentar as aplicações escolhidas para evitar variações futuras.

Aceite: legibilidade em 390 px e desktop, sem deformação, fundo acidental, nome cortado ou assinaturas contraditórias.

## 5. Resumo e gráficos — I02, I03, I05

### 5.1 Situação dos clientes

Substituir a rosca genérica por um card **Atualização dos clientes**, com barra horizontal de distribuição e três totais clicáveis: Em dia, Desatualizados e Verificação pendente. Informar quantos clientes são elegíveis e quantos não participam da avaliação. O gráfico é auxiliar; os valores e ações precisam funcionar sem ele.

- [ ] Aplicar categorias da seção 3.3, em vez do prazo de 60 dias.
- [ ] Mostrar número e percentual com denominador explícito.
- [ ] Abrir lista com o mesmo filtro ao clicar em cada situação.
- [ ] Mostrar até três sistemas com mais clientes desatualizados e Ver todos.
- [ ] Estado vazio deve orientar a cadastrar sistemas, oficiais ou atendimentos conforme o problema.
- [ ] Não mostrar 100% em dia quando não houver clientes elegíveis.
- [ ] Não misturar falha/offline de agente com versão registrada em atendimento.
- [ ] Conferir que a população aberta pelo clique corresponde à contagem.

### 5.2 Sem atendimento há mais de 60 dias

- [ ] Renomear indicador para **Sem atendimento há mais de 60 dias**, usando o prazo configurado.
- [ ] Separar Nunca atendidos de clientes com atendimento antigo.
- [ ] Corrigir destino do clique: hoje abre Sistemas sem reproduzir o conjunto contado.
- [ ] Abrir lista com cliente, último atendimento e dias; responsável somente se houver fonte definida.
- [ ] Remover fundo escuro arredondado do ícone de alerta.
- [ ] Usar ícone simples e cor discreta, coerente com os demais indicadores.
- [ ] Não tratar acompanhamento preventivo como falha crítica do sistema.
- [ ] Validar contraste, foco e leitura nos dois temas.

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
- [ ] Retirar `btn--ghost` das ações que precisam se apresentar como botões, especialmente Excluir.
- [ ] Manter borda perceptível em repouso, não apenas no hover.
- [ ] Distinguir ação destrutiva por rótulo e cor, não só por ícone.
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

- [ ] Remover Converter do formulário, menus de linha, comandos e dicas.
- [ ] Localizar chamadores antes de retirar handlers e método sem uso.
- [ ] Manter cadastro de atualização independente do agendamento.
- [ ] Remover instruções antigas de conversão da documentação.
- [ ] Testar que concluir tarefa não cria atualização nem altera versão de cliente.

### 8.2 Recuperar arquivamento manual

A regra atual permite arquivar tarefa concluída. Preservá-la nesta entrega; permitir arquivar pendentes seria outra decisão de negócio.

- [ ] Mostrar Arquivar na linha concluída e no formulário correspondente.
- [ ] Não oferecer ação inválida em tarefa pendente; explicar quando necessário.
- [ ] Reutilizar rota existente, com retorno claro de sucesso ou erro.
- [ ] Retirar da lista ativa sem apagar histórico.
- [ ] Manter acesso a Arquivadas mesmo com contagem zero.
- [ ] Diferenciar Desarquivar de Reabrir: verificar se a operação existente altera também o status antes de escolher o rótulo.
- [ ] Preservar arquivamento automático e sua configuração administrativa.
- [ ] Testar lista/Kanban, filtros e papéis admin/operador/consulta.

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
- [ ] Quando houver dados do agente, identificar origem e separar contato/falha da versão recebida em atendimento.
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

- [ ] Situação: Todos, Em dia, Desatualizados, Sem informação; demais estados quando aplicáveis.
- [ ] Busca por cliente/cidade sem alterar versão.
- [ ] Oferecer Último atendimento antes de em Filtros, com data opcional.
- [ ] A data filtra o atendimento; não substitui a oficial usada na classificação de versão.
- [ ] Retirar ambiguidade atual: digitar consulta, mas o mesmo campo pode salvar referência.
- [ ] Colunas: Cliente, Último atendimento, Versão recebida, Oficial e Situação; cidade secundária/opcional.
- [ ] Abrir ficha na linha para investigar pendência.
- [ ] Excluir fixos da seleção principal de controle.
- [ ] Preservar filtros ao voltar, sem manter oficial antiga em cache.

### 10.2 Gerenciador de oficiais

- [ ] Uma linha por sistema atualizável, com versão salva.
- [ ] Mostrar autor/data da alteração quando disponíveis; prever persistência se ausentes.
- [ ] Edição explícita por linha com Salvar/Cancelar e validação de data.
- [ ] Explicar: novos atendimentos usam a oficial; os existentes preservam versões recebidas.
- [ ] Referência ausente não pode implicar Em dia.
- [ ] Preservar papéis atuais de gravação; consulta apenas visualiza.
- [ ] Invalidar Resumo, Sistemas, Consulta e relatórios após mudança.
- [ ] Detectar edição concorrente antes de sobrescrever uma oficial alterada por outra pessoa.
- [ ] Fechar painel ou trocar seleção não pode gravar alterações.

Aceite: filtro nunca grava; salvar não reescreve atendimento; sistemas aceitam oficiais diferentes; limpar oficial não torna todos os clientes atualizados.

## 11. Usuários e Administração — I17, I18

### 11.1 Último acesso

- [ ] Renderizar Hoje, Ontem e Há 2 dias com inicial maiúscula na célula.
- [ ] Manter data/hora completa no detalhe acessível.
- [ ] Preservar Nunca entrou quando não houver login.
- [ ] Alterar apresentação local, sem capitalizar todas as frases de `tempoRelativo()` usadas em textos corridos.

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

| Grupo | Conteúdo proposto | Escopo | Trabalho |
|---|---|---|---|
| Minha conta | Nome, senha, sessões e sair dos outros aparelhos | Pessoal | Reorganizar existente |
| Trabalho diário | Tela inicial, filtros lembrados, lista/Kanban, linhas por página, responsável padrão quando autorizado | Pessoal | Parte existente; novas preferências pontuais |
| Notificações | Tipos de evento, minhas tarefas/equipe, som opcional, desktop e duração | Pessoal | Ampliar eventos e política; reaproveitar controles |
| Relatórios/exportação | Abertura da prévia, opções gerenciais de observações e impressão quando suportadas | Pessoal | Novas opções limitadas |
| Interface/acessibilidade | Tema, densidade, texto, movimento, contraste e foco | Pessoal | Consolidar e reduzir destaque |
| Regras da equipe | Prazos, arquivamento, fixos e padrões operacionais | Global/admin | Link para Administração; não duplicar formulários |
| Sobre e ajuda | Versão do painel, atalhos e significado das situações | Informativo | Consolidar |

O chamado aprovado não deve virar um editor livre de campos nesta entrega. Preferências de relatório não podem reintroduzir seus campos removidos.

- [ ] Abrir em Minha conta ou Trabalho diário, não num catálogo de temas.
- [ ] Recolher personalizações avançadas em subseção.
- [ ] Manter tema, texto, densidade e acessibilidade fáceis de encontrar.
- [ ] Reavaliar destaque de fonte, fundo decorativo, perfis visuais e largura ajustável.
- [ ] Reaproveitar busca e restauração por seção.
- [ ] Identificar ajuste pessoal versus global quando houver risco de confusão.
- [ ] Definir persistência por usuário e comportamento em outro navegador.
- [ ] Migrar preferências antigas preservando valores.
- [ ] Validar valores e chaves no servidor.
- [ ] Não oferecer opção de notificação que não altere comportamento real.
- [ ] Se houver horário silencioso, definir fuso, eventos críticos e mensagens acumuladas.
- [ ] Mostrar estado real da permissão de notificação de desktop, inclusive bloqueio.
- [ ] Não acrescentar idioma/fuso decorativos sem suporte integral nas datas e relatórios.
- [ ] Testar restauração, sincronização e conta sem acesso administrativo.

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

### Fora da prioridade atual

Chat interno, CRM completo, financeiro, grande editor de dashboards e automações sem revisão. Aumentariam escopo antes de resolver os problemas operacionais identificados.

## 14. Sequência de execução

| Etapa | Entrega verificável | Dependência | Esforço relativo |
|---|---|---|---|
| 0 | Baseline, capturas e dados sintéticos | Consolidar alterações atuais | Pequeno |
| 1 | Fixos, classificação única e filtro/oficial separados | Esquema atual e regras da seção 3 | Grande |
| 2 | Indicadores úteis e tendência correta | Etapa 1 | Médio |
| 3 | Botões, filtros, planilhas, Clientes e Agendamentos | Padrões e APIs existentes | Médio |
| 4 | Relatórios e ficha revisados | Etapas 1 e 3 | Médio |
| 5 | Administração e Configurações | Inventário de regras/permissões | Grande |
| 6 | Identidade aplicada e revisão visual | Escolha de marca; componentes estáveis | Médio |
| 7 | Central de pendências | Etapas 1, 2 e 3 | Grande; opcional |

A definição visual da marca pode começar na etapa 0; aplicação global fica para componentes estabilizados. Último acesso e Arquivar podem ser corrigidos cedo. Esforços são relativos, não prazos fechados: migrações e permissões precisam ser consolidadas antes de estimar horas/dias com confiança.

### Checklist mestre

- [ ] E0 — registrar baseline e preservar alterações de outros trabalhos.
- [ ] E1 — unificar situação e excluir fixos das métricas de versão.
- [ ] E2 — separar oficiais e filtros em Sistemas.
- [ ] E3 — revisar Resumo e destinos dos indicadores.
- [ ] E4 — corrigir meses, calendário e valores do gráfico.
- [ ] E5 — padronizar bordas, ícones e toolbars.
- [ ] E6 — recolher datas e reposicionar planilhas.
- [ ] E7 — revisar Agendamentos, remover conversão e recuperar Arquivar.
- [ ] E8 — acessos na linha e Grupo/Rede compacto.
- [ ] E9 — revisar ficha e retirar CNPJ apenas do contexto solicitado.
- [ ] E10 — redesenhar relatórios conservando o texto aprovado.
- [ ] E11 — corrigir Último acesso e reorganizar Administração.
- [ ] E12 — reorganizar Configurações e implementar opções operacionais priorizadas.
- [ ] E13 — escolher e aplicar identidade.
- [ ] E14 — concluir validação visual, funcional e documentação.
- [ ] E15 — avaliar Central de pendências em entrega independente.

## 15. Validação e critérios gerais de aceite

### Regras e dados

- [ ] NFe recebido em 22/09 fica atrasado após oficial 24/09 sem reescrever histórico.
- [ ] Novo atendimento recebe a oficial; editar observação preserva a recebida.
- [ ] Cliente somente com fixos não entra na fila nem no denominador de versões.
- [ ] Cliente com vários sistemas conta uma vez na situação consolidada.
- [ ] Informação ausente não produz Em dia.
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
- [ ] Configurações alteram comportamento real e persistem no escopo correto.
- [ ] Falha de rede, sessão expirada e conflito não produzem sucesso falso.
- [ ] Importação falha não deixa alteração parcial sem resultado explícito.

### Visual e acessibilidade

- [ ] Inspecionar 390, 768, 1280 e 1440 px, zoom 200%, sidebar aberta/recolhida.
- [ ] Conferir temas claro/escuro e contraste elevado disponível.
- [ ] Conferir bordas, foco, desabilitados, teclado e alvos de toque.
- [ ] No celular, informação essencial não depende de tabela cortada: usar resumo, blocos ou expansão quando necessário.
- [ ] Gráfico não corta meses, valor nem tooltip e oferece leitura textual.
- [ ] Modal permite alcançar rodapé por teclado, sem rolagem horizontal.
- [ ] PDF multipágina sem sidebar, controles ou conteúdo cortado.
- [ ] Nomes longos, observações multilinha e caracteres HTML seguros e legíveis.

### Engenharia e entrega

- [ ] Revalidar estado dos arquivos antes de editar e preservar alterações alheias.
- [ ] Rodar `npm run check`, testes pertinentes e `git diff --check` a partir de `web`.
- [ ] Cobrir regras e autorização das APIs de sistemas, importação, arquivamento e preferências.
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

Não impedem as correções objetivas. Resolver cada uma quando afetar a entrega, apresentando proposta concreta para visualizar.

| Decisão | Recomendação inicial |
|---|---|
| Nome/símbolo | Avaliar Bredas Gestão contra Gestor de Atualizações |
| Situação no Resumo | Barra e totais clicáveis, substituindo rosca |
| Sistemas fixos | Classificação no catálogo, administrável |
| Arquivar pendente | Manter apenas concluídas nesta entrega |
| Importação de operador | Preservar permissão com entrada discreta |
| Datas em Sistemas | Filtro recolhível e gerenciador separado |
| Configurações | Conta, operação, eventos e relatórios primeiro |
| Nova aba | Central de pendências após corrigir regras e validar uso |

O resultado esperado é um painel mais útil, com menos ambiguidade. Novas abas vêm depois de indicadores, filtros e ações principais representarem corretamente o trabalho da equipe.
