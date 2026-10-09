# Planejamento de polimento visual do painel

Data: 08/10/2026. Atualizado em 09/10/2026. Status: etapas 1 e 2 implementadas, com validação e ressalvas registradas abaixo.

Escopo: Sistemas, Campanhas, Administração e Configurações, exclusivamente em desktop. Referência visual: Configurações → Sobre e ajuda.

## 1. Objetivo e base da análise

Deixar as quatro telas mais discretas, alinhadas e fáceis de ler, preservando a identidade do projeto e os fluxos existentes. A intervenção deve melhorar a hierarquia das informações, o uso de cores, os espaçamentos e a organização das ações.

Este plano foi elaborado a partir do código e das observações do usuário. A execução foi autorizada em 09/10/2026, uma etapa por vez. Na etapa 1, as quatro telas e Sobre e ajuda foram inspecionadas no navegador com banco descartável. Na mesma sessão, o usuário restringiu a iniciativa a desktop: adaptações e validação para celular ficam excluídas de todas as etapas.

### Constatações na elaboração do plano

| Tela | Evidência atual | Consequência para o plano |
|---|---|---|
| Sistemas | `SistemasView.js` aplica `rowStyle` com fundo por situação; `severidadeCor` mistura a cor de severidade com a zebra da tabela. | Substituir o preenchimento colorido por um indicador lateral discreto, mantendo a situação escrita. |
| Campanhas | Tela com lista lateral e detalhe, filtros rápidos, placar e ações; há altura calculada e rolagens internas no desktop. | Harmonizar os componentes e verificar espaço útil, quebras e rolagem antes de mudar a estrutura. |
| Administração | A própria pessoa recebe um badge na coluna Papel; as outras recebem `select.input.admin-papel`, com largura mínima de 150px. | Uniformizar o tamanho e alinhamento do campo, distinguindo edição e leitura de maneira acessível. |
| Configurações | Cabeçalho, cartão e ajuste já têm níveis distintos: `--txt-xl`, `--txt-lg` e `--txt-md`. | A queixa não deve ser tratada apenas aumentando fontes: avaliar peso, espaçamento, agrupamento e competição visual. |
| Sobre e ajuda | Cada assunto tem uma apresentação própria: visão geral, novidades, grade de telas, legenda e suporte, com índice da página. | Reaproveitar a hierarquia e organização; adaptar a apresentação à função de cada tela. |

### Limites

- Preservar permissões, validações, filtros, ordenação, paginação e navegação.
- Preservar regras de situação e a distinção entre versão recebida e oficial, inclusive a referência pela data do B_Vendas.
- Preservar metas, público por cidade ou clientes escolhidos, baixa automática e placar congelado das campanhas encerradas.
- Manter preferências pessoais separadas das regras da equipe e respeitar a forma atual de aplicação e salvamento.
- Não alterar banco, APIs ou regras de negócio para viabilizar o polimento.
- Manter JavaScript/CSS do projeto, sem framework, dependência de frontend ou build adicional.
- Atualizador Automático, agentes, Distribuição, pacotes e publicação ficam fora desta iniciativa. Na Administração, preservar esses controles existentes sem reformulá-los.
- Não expandir o escopo para outras telas; componentes compartilhados exigem verificação de regressão nos seus consumidores.

## 2. Direção visual comum

### Hierarquia

Adotar a leitura: título da seção → explicação breve → título do bloco → nome do campo ou informação → texto de apoio → controle/ação. Usar os tokens atuais como ponto de partida; só introduzir ajustes de escala após comparação no navegador.

Títulos de bloco devem se destacar por peso e respiro. Rótulos de campos devem ter menor protagonismo e textos de ajuda devem ser legíveis, próximos ao assunto e mais discretos. Valores importantes, como progresso e versão, podem ter destaque adequado à tarefa.

### Cores, superfícies e alinhamentos

- Fundos predominantemente neutros, com bordas suaves e sombras contidas.
- Cor de destaque para seleção e ação principal; cores de situação para estado operacional.
- Não utilizar vermelho, amarelo ou verde como decoração sem significado.
- Mesma referência de altura para campos, seletores e botões que compartilham uma linha.
- Alinhar títulos, descrições e conteúdo ao mesmo eixo; permitir que textos longos quebrem sem deslocar ações indevidamente.
- Usar espaçamentos e raios existentes, evitando valores isolados e compensações por margens negativas.
- Manter estados de foco, hover, seleção, carregamento, erro, vazio e desabilitado identificáveis.

### Como usar Sobre e ajuda

Copiar os princípios: assuntos bem separados, destaque seletivo, textos curtos, bom respiro e variação de apresentação conforme o conteúdo. Manter tabelas onde há comparação, controles onde há ajustes e indicadores onde há acompanhamento. O índice lateral só será considerado em seções realmente longas, após verificar necessidade; não será acrescentado a todas as telas.

## 3. Etapa 1 — Referência e padrão compartilhado

Prioridade: alta. Dependência: nenhuma.

- [x] Abrir as quatro telas e Sobre e ajuda; registrar os pontos de comparação e exemplos relevantes.
- [x] Conferir temas claro e escuro, escala de fonte e densidade disponíveis.
- [x] Definir a hierarquia de títulos, rótulos e textos auxiliares usando os tokens existentes.
- [x] Definir alinhamentos de cabeçalhos, cartões, toolbars e controles.
- [x] Conferir consumidores de `cabecalhoSecao`, `tituloCartao`, `.cfg-group` e estilos de tabela antes de ajustes compartilhados.
- [x] Implementar apenas a base compartilhada aprovada, evitando grandes mudanças globais em `.card`, `.input` e `.data-table`.
- [x] Conferir a base em Configurações e Administração e observar efeitos nas demais telas que a usam.

Aceite: os níveis de informação se distinguem no navegador; controles de uma mesma linha estão alinhados; Sobre e ajuda mantém sua organização; não aparecem regressões nos componentes compartilhados.

## 4. Etapa 2 — Sistemas: cores discretas e organização

Prioridade: alta. Dependência: etapa 1.

### Proposta

Substituir o fundo inteiro colorido por uma faixa lateral de aproximadamente 3px na linha do cliente, respeitando a estrutura da tabela de desktop. Usar fundo neutro e preservar a zebra configurada pelo usuário.

A cor atual é de situação, não uma cor exclusiva de cadastro do cliente. Manter esse significado: boa para Em dia, atenção para Aguardando atualização, alta para Desatualizado/Nunca atualizado, e neutra para ausência de referência. Confirmar a correspondência com os estados reais e com a legenda de ajuda; não criar nova classificação.

- [x] Retirar o preenchimento por severidade sem perder zebra, hover ou foco.
- [x] Aplicar indicador lateral por situação sem alterar a altura ou largura útil das linhas.
- [x] Manter o texto da situação; a faixa não será a única forma de identificar o estado.
- [x] Conferir legibilidade das cores nos dois temas e em alto contraste.
- [x] Alinhar nome do cliente, última atualização, situação e cidade; manter a referência oficial fora das linhas, como já ocorre.
- [x] Tratar nomes e cidades longos, datas ausentes e notas pela data do B_Vendas. Preservar versões recebidas onde já são apresentadas, sem acrescentar essa coluna à consulta de Sistemas.
- [x] Organizar filtros, busca, contagem e referência oficial com menos competição visual.
- [x] Polir o painel de versões oficiais: campos, datas, autoria, ações e mensagens de retorno.
- [x] Conferir linhas da tabela, clique na ficha, filtros e ordenação em desktop.

Aceite: cada cliente aparece sobre fundo neutro, com identificação discreta da situação; informações e ações não se sobrepõem; a navegação para Consulta e as regras de versão permanecem iguais.

## 5. Etapa 3 — Campanhas: integração com o padrão do painel

Prioridade: média-alta. Dependência: etapa 1; executar após Sistemas para manter a sequência de revisão.

### Proposta

Preservar lista e detalhe, tornando o cabeçalho, o placar, os filtros e as ações compatíveis com o restante do painel. A sequência de leitura do detalhe será: campanha selecionada → sistema, meta, público e prazo → progresso → clientes e ações.

- [ ] Harmonizar o cabeçalho da tela e o botão Nova campanha com o padrão compartilhado.
- [ ] Deixar Ativas/Encerradas e seleção da campanha claramente identificáveis, com destaque contido.
- [ ] Ajustar títulos, porcentagens e metadados dos cartões da lista lateral.
- [ ] Separar título, descrição, sistema, meta, cidade/público e prazo no detalhe.
- [ ] Equalizar os indicadores de progresso: rótulos consistentes, números alinhados e barra legível.
- [ ] Dar prioridade à ação mais útil no contexto; agrupar ações secundárias para evitar uma faixa de botões competindo com o título.
- [ ] Revisar filtros de clientes, busca e contagem quando faltar espaço.
- [ ] Alinhar células de cliente, última atualização, situação e ações; acomodar detalhes de agendamento.
- [ ] Padronizar formulários de criação/edição, escolha de público e agendamento em lote.
- [ ] Conferir mensagens de campanha encerrada, vazio, nenhum resultado e carregamento.
- [ ] Verificar altura mínima e rolagens internas; ajustar apenas se a inspeção confirmar corte ou rolagem desnecessária.
- [ ] Conferir lista e detalhe nas larguras de desktop, preservando a seleção ao navegar.

Aceite: a campanha tem leitura clara e ações previsíveis; o placar não domina a tela; nomes e descrições longos não prejudicam os controles; criação, edição, filtros, agendamento, exportação e encerramento conservam seu comportamento.

## 6. Etapa 4 — Administração: padronizar Papel e os blocos

Prioridade: alta para Papel; média para os demais ajustes. Dependência: etapa 1.

### Pessoas e permissões

Manter o papel editável na própria linha para as demais contas. A própria conta continua em leitura: usar uma apresentação com altura, tipografia e alinhamento compatíveis, sem fingir que o valor pode ser alterado.

- [ ] Uniformizar o campo Papel: altura, tamanho de texto, largura adequada e alinhamento vertical.
- [ ] Preservar os rótulos centralizados de Administrador, Operador e Consulta.
- [ ] Evitar que o selo da própria conta e os seletores pareçam elementos de telas diferentes.
- [ ] Explicar discretamente a restrição da própria conta, com informação acessível além de tooltip.
- [ ] Preservar indicação de salvamento e restauração do valor anterior em cancelamento ou falha.
- [ ] Alinhar pessoa, usuário, papel, último acesso e Gerenciar; conferir nomes longos e Nunca entrou.
- [ ] Harmonizar resumo de pessoas, busca e legenda de permissões nas larguras de desktop.
- [ ] Preservar confirmações, bloqueios e efeitos existentes das alterações de papel sobre sessões.

### Demais seções

- [ ] Operação: alinhar regras numéricas, unidades, classificações de sistemas e rodapé de salvar/desfazer.
- [ ] Dados: organizar importação, exportação e download com títulos e descrições de peso adequado.
- [ ] Integrações: harmonizar os blocos gerais de comunicação/endereço, preservando os controles do Atualizador fora do escopo.
- [ ] Backups e recuperação: distinguir política, lista de cópias e restauração, mantendo avisos e confirmações existentes.
- [ ] Auditoria: alinhar filtros, registros e detalhes sem reduzir a legibilidade dos valores anteriores/novos.
- [ ] Diagnóstico: organizar resumo, indicadores e detalhes; reservar destaque forte para problemas reais.
- [ ] Conferir abas, contadores e faixa de pendências sem acrescentar avisos redundantes.

Aceite: a coluna Papel tem apresentação consistente e edição compreensível; a Administração mantém suas sete seções; salvar/desfazer e operações sensíveis continuam claros e funcionais.

## 7. Etapa 5 — Configurações: hierarquia e explicações

Prioridade: alta. Dependência: etapa 1; aproveitar os ajustes compartilhados já revisados na Administração.

### Proposta

Preservar as abas atuais e organizar cada cartão em assunto, finalidade breve e ajustes. Reduzir a competição entre o título do cartão, os nomes dos campos e os controles. Manter próximo ao controle o texto necessário para escolher bem.

- [ ] Revisar todas as abas atuais: Minha conta, Trabalho diário, Notificações, Interface e acessibilidade, Regras da equipe e Sobre e ajuda.
- [ ] Diferenciar visualmente título da seção, título de cartão, rótulo do ajuste e explicação.
- [ ] Reduzir títulos repetidos quando o cartão e o campo comunicarem exatamente o mesmo assunto.
- [ ] Encurtar descrições vagas ou repetitivas, preservando efeitos, limites e informações úteis.
- [ ] Alinhar campos, interruptores, seletores e opções, acomodando as larguras de desktop e a fonte ampliada.
- [ ] Usar agrupamentos por finalidade e separadores leves; evitar fragmentar cada ajuste em um cartão isolado.
- [ ] Organizar Perfil rápido, tema, contraste e prévia para que a prévia complemente os ajustes sem comprimi-los.
- [ ] Manter busca, destaque do resultado, contadores por aba e indicação de ajuste alterado.
- [ ] Preservar restauração por seção, exportação/importação de preferências e aplicação imediata dos ajustes pessoais.
- [ ] Deixar explícito quando algo vale só para a pessoa e quando é uma regra da equipe.
- [ ] Polir conta, senha e sessões sem perder orientação ou ações existentes.
- [ ] Preservar a estrutura de Sobre e ajuda, adaptando apenas o necessário para consistência.

Aceite: é possível identificar o assunto de um cartão antes de ler seus campos; o texto explica a consequência do ajuste; controles não comprimem descrições; busca e preferências continuam funcionando.

## 8. Validação e entrega por etapa

A execução será uma etapa por vez. Para cada etapa, informar o que mudou, como foi verificado e limitações ainda existentes. Prioridade não autoriza execução antecipada das demais etapas.

### Validação visual e funcional

- [ ] Conferir 1280, 1440 e 1920px, nos temas claro e escuro.
- [ ] Conferir fonte ampliada, densidade compacta/confortável, alto contraste e sidebar recolhida.
- [ ] Não aceitar corte de nomes ou controles sobrepostos nas larguras de desktop; tabelas devem usar o espaço disponível sem comprometer a leitura.
- [ ] Conferir teclado, foco visível, rótulos de controles e compreensão dos estados sem depender apenas de cores.
- [ ] Conferir listas vazias, muitos registros, nomes/descrições longos e dados ausentes.
- [ ] Verificar ações e restrições dos perfis relevantes: admin, operador e consulta.
- [ ] Reproduzir fluxos afetados no navegador; testes de código não substituem validação visual.

### Verificação técnica

Para alterações de interface, executar a partir de `web/`: `npm run check`, `npm test` e `git diff --check`. Acrescentar teste de comportamento apenas quando houver mudança com risco real; evitar testes que somente reproduzem CSS ou markup.

Em entregas que alterem apenas planejamento, validar o Markdown, seus caminhos e o diff. Para etapas implementadas, registrar as verificações realmente executadas.

### Mapa técnico

| Parte | Arquivos principais |
|---|---|
| Base | `client/css/theme.css`, `client/css/components.css`, `client/js/templates/secao.js` |
| Sistemas | `client/js/views/SistemasView.js`, `client/js/components/TabelaOrdenavel.js` |
| Campanhas | `client/js/views/CampanhasView.js`, `client/js/templates/campanhas.js` |
| Administração | `client/js/views/AdministracaoView.js`, `client/js/views/administracao/*.js`, `client/js/templates/administracao.js` |
| Configurações | `client/js/views/ConfiguracoesView.js`, `client/js/views/configuracoes/ajustes.js`, `SecaoAjustes.js`, `controles.js`, `ContaConfig.js`, `RegrasEquipeConfig.js`, `client/js/templates/configuracoes.js` |
| Referência | `client/js/views/configuracoes/SobreAjuda.js`, `client/js/templates/sobre.js` |

## 9. Sequência recomendada

1. Referência e padrão compartilhado.
2. Sistemas: fundo neutro, faixa de situação e alinhamentos.
3. Campanhas: cabeçalho, lista, progresso, ações e distribuição do espaço em desktop.
4. Administração: Papel e organização das seções.
5. Configurações: hierarquia, explicações e organização dos controles.

Começar pela etapa 1 permite confirmar a direção no navegador antes de espalhá-la pelas quatro telas. O resultado esperado é um painel mais coeso, com cor reservada ao que ajuda a decidir e informações organizadas pela tarefa de cada tela.

## 10. Registro da execução — etapa 1 (09/10/2026)

**Referência e decisões:** Sobre e ajuda já separa assuntos com títulos destacados, descrições curtas e respiro. Configurações já usa a escala `--txt-xl` → `--txt-lg` → `--txt-md` → `--txt-sm`; ela foi preservada. Administração compartilha os cabeçalhos e linhas de ajuste. Sistemas e Campanhas mantêm componentes próprios: seu polimento específico segue nas etapas 2 e 3. O CSS já continha alterações anteriores dessas telas; a etapa 1 não as substitui nem declara essas etapas concluídas.

**Base implementada em `client/css/components.css`:** textos auxiliares com margem e entrelinha consistentes; títulos e ações podem quebrar sem sobreposição; linhas de ajuste reservam espaço para explicações no desktop; grupos de opções acomodam fonte ampliada; contadores não quebram seus números; o indicador de preferência alterada fica dentro da linha, sem margem negativa. Não houve mudança global em cartões, inputs ou tabelas, nem alteração de regras, banco ou APIs.

**Verificação:** navegador Edge headless com servidor local e banco descartável; inspeção das quatro telas e da referência, com nomes e descrição longos; comparação das abas de Configurações e das sete seções da Administração nos dois temas, fonte padrão/ampliada, densidade padrão/compacta/confortável, alto contraste e sidebar recolhida. Mudança de densidade e abertura da restauração por seção verificadas; foco por teclado visível. `npm run check` passou; `npm test` passou com 639 testes de servidor e 542 de cliente; `git diff --check` passou. Capturas e medições ficam em `%TEMP%/polimento-visual-tools/evidencias/`.

**Ressalvas:** com nome de conta longo e fonte ampliada em 1280px, o cabeçalho geral pode exceder a largura. A comparação com o CSS anterior reproduziu o mesmo problema; esse componente fica fora da base desta etapa. A verificação visual usou conta administradora; não houve inspeção visual de todas as ações com operador e consulta, nem operações sensíveis em dados reais. Essas limitações impedem afirmar que toda a interface está livre de problemas.

**Sequência na entrega da etapa 1:** etapas 2 a 5 permaneciam pendentes. A etapa 2 foi executada depois, conforme o registro abaixo.

## 11. Registro da execução — etapa 2 (09/10/2026)

**Implementação:** a tabela de Sistemas usa fundo neutro e faixa interna de 3px. Classes específicas aplicam os tokens do tema: verde para Em dia, amarelo para Aguardando atualização, vermelho para Desatualizado/Nunca atualizado e neutro para os demais estados. O texto da situação foi preservado. As cores acompanham a troca de tema sem recalcular a tabela em JavaScript. O preenchimento antigo já havia sido parcialmente retirado; a etapa corrigiu a aplicação da faixa e a ausência da cor de atenção.

Nomes e cidades podem quebrar dentro das células, com mais espaço para o cliente e sem acrescentar a versão recebida à consulta. Datas usam números alinhados e a nota pela data do B_Vendas continua visível. Referência oficial e contagem ficam em uma linha própria, abaixo dos campos e ações. Os controles têm a mesma referência de altura.

O painel de versões oficiais recebeu superfície neutra, hierarquia de título/valor/autoria, alinhamento de campos e ações, explicação visível para datas inválidas e mensagem de salvamento/remoção anunciada ao leitor de tela. Cancelamento, validação, permissões e edição concorrente conservam os fluxos existentes. O utilitário de mistura de cores, seus testes exclusivos e o leitor/cache de tokens sem consumidores foram removidos; as cores agora vêm diretamente do CSS.

**Validação visual e funcional:** Edge headless, servidor local e banco descartável com 28 clientes, nomes/cidade longos e estados diferentes. Foram conferidas 18 combinações de 1280/1440/1920px, temas claro/escuro e apresentação padrão, compacta com fonte ampliada/sidebar recolhida e confortável com fonte ampliada/alto contraste. Capturas inspecionadas e medições sem excesso de largura na tabela. Também conferidos zebra desligada, hover com faixa preservada, vazio, busca por cidade, filtro de situação/data, ordenação, teclado e abertura da ficha, nota do B_Vendas no NFCe e ausência de referência. Na edição: data inválida, cancelar, salvar, conflito concorrente, remoção da referência e histórico inalterado. Operador conserva edição e consulta vê apenas leitura.

**Verificação técnica:** `npm run check` passou. `npm test` validou os 639 testes do servidor; detectou o utilitário órfão no cliente, removido nesta etapa. A suíte completa do cliente foi repetida após a correção e passou com 536 testes. `git diff --check` passou. Evidências em `%TEMP%/polimento-visual-tools/evidencias/etapa2/`.

**Limites:** nenhum banco real foi alterado; não houve publicação. As regras de versão/situação e APIs foram preservadas. A ressalva anterior sobre o cabeçalho geral com nome longo em 1280px permanece fora deste ajuste. A etapa 3 é a próxima; etapas 3 a 5 seguem pendentes.
