# Histórico de mudanças — painel web

Registro do que foi acrescentado em cada etapa, **com o motivo de cada
decisão** — inclusive as que deram errado antes de dar certo. Este arquivo
nasceu dentro do [README](README.md) e foi separado quando passou de 270
linhas: quem chega no projeto precisa do README curto o bastante para ler
inteiro, e quem investiga "por que isso é assim?" precisa deste histórico
inteiro. São públicos diferentes.

Não é um changelog de versões publicadas (o projeto não versiona releases
do painel): é um diário de decisões, em ordem cronológica.

Para o agente C#, o equivalente é
[`atualizador/RISCOS-CONHECIDOS.md`](../atualizador/RISCOS-CONHECIDOS.md).

### Setembro de 2026

- **Campanhas, "Campanha com quem falta" (02/10/2026):** no detalhe de qualquer campanha (inclusive a encerrada) um botão abre o formulário de nova campanha já preenchido: mesmo sistema e versão-alvo, só "clientes escolhidos" marcados com quem ainda não cumpriu a meta (pendentes e já agendados), título "… — quem falta" e a descrição herdada. Serve para fechar a conta de uma campanha que acabou com gente faltando, sem remarcar os clientes à mão.
  - O prazo não vem: o da campanha anterior já passou. A lista de clientes é a mesma de sempre e dá para ajustar antes de criar; trocar para "todos" também vale.

- **Campanhas, "Agendar pendentes" (02/10/2026):** um botão no detalhe cria a tarefa de atualização de todos os clientes pendentes de uma vez, na data escolhida (a de hoje vem sugerida). Antes era um clique por cliente, na linha.
  - Só quem está pendente agora ganha tarefa: quem já está agendado ou foi atendido fica de fora, e por isso um clique duplo não agenda ninguém duas vezes. Prioridade Alta se a campanha tem prazo, Normal se não; o responsável é quem clicou.
  - Entra tudo ou nada, com **uma** linha na Auditoria ("N tarefas de atualização agendadas"), e não uma por tarefa.
  - O botão "Agendar" da linha passou a usar a mesma rota (`POST /api/campanhas/:id/agendar`, só Operador e Admin): o texto da tarefa, a prioridade e a regra de "pendente" moram só no servidor e os dois caminhos saem iguais. A tarefa tem o mesmo conteúdo de antes.

- **Campanhas, saiu "Exportar pendentes" (02/10/2026):** o botão, a rota `GET /api/campanhas/:id/export` e a planilha (`.xlsx`) foram removidos, a pedido da equipe. Quem falta continua na tabela da campanha, com os filtros e a busca. A exportação de outras telas (Atualizações, Clientes etc.) não mudou.

- **Campanhas, adicionar e retirar cliente no detalhe (02/10/2026):** numa campanha de clientes escolhidos, "Adicionar clientes" (mesma lista com busca e filtros, sem quem já está) e um "×" em cada linha ("Retirar da campanha") evitam abrir "Editar" e refazer a lista inteira.
  - Só em campanha de clientes escolhidos e aberta: a de "todos" não tem lista (edite o público) e a encerrada tem o placar congelado (reabra antes). A campanha não fica sem nenhum cliente. Retirar não mexe no cadastro nem nas atualizações do cliente.
  - Rotas `POST /api/campanhas/:id/clientes` e `DELETE /api/campanhas/:id/clientes/:clienteId`, só Operador e Admin; o servidor confere que o cliente usa o sistema.

- **Campanhas, filtros na lista de escolha (02/10/2026):** acima da lista de clientes do formulário agora há filtro por cidade, grupo/rede e regime tributário, e "Só quem ainda não está na versão-alvo". "Marcar os visíveis" respeita os filtros, então marcar todo o regime X de uma Nota Técnica é um clique. Antes só havia a busca por texto.
  - O "já cumpre" usa a mesma regra da campanha, contra a versão-alvo digitada no formulário; sem uma data completa e real o filtro fica desabilitado (o servidor devolve `atendido: null`, e não "pendente" para todos). Seletor com uma opção só não aparece.

- **Campanha só para clientes escolhidos (02/10/2026):** o formulário de campanha ganhou "Quem entra na campanha": todos os clientes do sistema (como sempre, com a cidade opcional) ou só os clientes marcados numa lista com busca por nome, código ou cidade, "Marcar os visíveis" e "Limpar". Serve para um piloto ou para quem uma Nota Técnica atinge, sem criar uma campanha do sistema inteiro e ignorar a maioria.
  - Continua valendo a baixa automática pela atualização, o "já agendado" por tarefa do mesmo sistema e o placar congelado no encerramento.
  - Dá para trocar a lista depois de criada (a meta, sistema e versão-alvo, continua fixa). Escolher clientes substitui a cidade.
  - Cliente escolhido que perde o sistema no cadastro sai da lista; se todos saírem, a campanha fica vazia (0 de 0), e não vira "todos". Migração 7; decisão na [ADR-0009](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0009).

- **Classificação dos sistemas em lote — F5 (01/10/2026):** a lista de Administração › Operação ganhou um filtro por nome e passou a ter um "Salvar" e um "Desfazer" só, no pé do cartão, para todas as linhas alteradas. Antes havia um Salvar por linha: reclassificar cinco sistemas eram cinco cliques, e uma linha alterada e esquecida não avisava ninguém.
  - Só vai ao servidor o que mudou de verdade (`alteracoesClassificacao`, com teste), então voltar uma linha para como estava não gera registro na Auditoria.
  - Com sistema alterado, a barra fica presa no pé da tela, voltar à aba não apaga as marcações, e sair da conta ou recarregar a página avisa.
  - Se um sistema falhar ao salvar, os outros continuam salvos e a mensagem diz qual faltou.

- **Diagnóstico, "Copiar para o suporte" — F6 (01/10/2026):** um botão junta a conferência num texto pronto para colar: situação, pendências, versão, Node, tempo no ar, memória, banco, backups, agentes, pacotes e navegador. Antes, o administrador copiava número por número ou mandava um print que não dava para pesquisar. O texto é o mesmo da tela no momento da conferência e não leva nada que dê acesso (só o nome do arquivo do banco, nunca a chave dos agentes). A ajuda da aba Sobre cita o botão.

- **Backups e Dados — F4 (01/10/2026):**
  - **Fazer cópia agora:** novo botão em Backups (`POST /api/backups`, só admin, com o mesmo limitador dos downloads). Serve para antes de uma importação grande ou de reclassificar sistemas, já que a cópia automática só acontece quando o servidor inicia. A cópia é conferida, entra na mesma retenção, fica registrada na Auditoria e atualiza a faixa de pendências na hora.
  - **Conferência de cadastros (Dados):** antes eram só dois botões que abriam Clientes e Sistemas. Agora mostra quantos e quais clientes estão sem nenhum sistema (`GET /api/clientes/sem-sistema`) e quais sistemas atualizáveis estão sem versão oficial. Os dois casos ficam fora da conta de situação sem ninguém perceber.
  - **Botão repetido:** saiu de Dados o "Baixar banco de agora", que já está em Backups.
- **Correção — a retenção podia apagar uma cópia nova (01/10/2026):** com dez ou mais cópias no mesmo segundo, os nomes com sufixo eram ordenados como texto ("_10" antes de "_2"). Além disso, `nomeLivre` reaproveitava o nome da cópia mais antiga depois que ela era apagada. Nos dois casos, a poda seguinte apagava uma das cópias mais novas. Rara na subida do servidor, possível com o botão novo, e foi o teste dele que mostrou. A ordem agora é cronológica (`compararBackups`), e o sufixo novo vem sempre depois do maior já usado.

- **Aviso de alteração não salva — F7 (01/10/2026):** trocar de tela já não perdia nada, porque as telas ficam montadas. Perdia-se ao recarregar ou fechar a página e ao sair da conta, que desmonta o app. Agora, com uma regra da equipe alterada e não salva, uma gaveta de Pessoas preenchida ou uma senha/nome digitados em Minha conta:
  - recarregar ou fechar a página dispara o aviso do navegador;
  - "Sair da conta" pergunta "Sair sem salvar?" e lista o que vai se perder.

  Esse aviso não é desligável como a confirmação comum de saída, porque só aparece quando há algo a perder. O registro fica em `utils/pendencias.js`, com teste.

- **Administração › Pessoas, contas de outras pessoas — F2 (01/10/2026):** cada linha ganhou "Gerenciar", que abre uma gaveta com quatro blocos:
  - **Nome:** com a mesma limpeza e o mesmo limite do próprio nome.
  - **Redefinir a senha:** para quem esqueceu a sua. Antes o único caminho era o script `resetar-senha` no servidor, ou apagar a conta e perder o vínculo com o Histórico. A pessoa é desconectada de todos os aparelhos.
  - **Encerrar todas as sessões:** desconecta a pessoa sem mudar a senha.
  - **Remover acesso:** saiu da linha da tabela e fica por último, separado, porque é o único que não se desfaz.

  A tabela mostra quantas sessões cada conta tem abertas. Rotas novas, só para administrador: `PUT /api/usuarios/:id/senha` e `DELETE /api/usuarios/:id/sessoes`. Nenhuma das duas vale para a própria conta: trocar a própria senha continua exigindo a senha atual, em Minha conta. A Auditoria passou a registrar o que mudou de verdade: renomear alguém aparecia como "atualizado para papel [...]", sugerindo uma promoção que não houve.

- **Administração, pendências à vista — F3 (01/10/2026):** quando algo precisa de atenção (nenhuma cópia ou cópia de 7 dias ou mais, banco com falha de integridade, agentes com erro, chave dos agentes ausente ou ainda com o valor de exemplo), uma faixa aparece entre as abas e o conteúdo de qualquer aba da Administração. Cada pendência é um atalho para a aba onde se resolve, e essa aba ganha o contador ao lado do nome. Antes isso só aparecia para quem abrisse o Diagnóstico. A regra é a mesma do Diagnóstico (`situacaoDiagnostico`), e a conferência roda no máximo uma vez por minuto, porque a Saúde executa o `integrity_check` do SQLite.

- **Administração e Configurações, limpeza — F1 (01/10/2026):**
  - A retenção de backups passou a usar o mesmo formulário das outras regras da equipe: Desfazer, aviso de "alteração não salva", e mínimo e máximo vindos do servidor. Feita à mão, a tela aceitava 1 e 2 cópias, que o servidor recusa (o mínimo é 3), e só avisava depois do clique.
  - Os nomes antigos das abas, repetidos duas vezes nas Configurações e uma na Administração, foram para `domain/abas.js`, com um teste que confere se todo alias aponta para uma aba que existe.
  - `mensagemDeErro` mora em `api/ApiPainel.js`, no lugar de três cópias.

- **Administração, visual — V3 (01/10/2026):**
  - **Diagnóstico:** a frase do topo passa a ser o pior bloco. Antes dizia "Tudo em ordem" logo acima de "Nenhuma cópia" e com a chave dos agentes no valor de exemplo. Cada pendência aparece listada com um botão que leva à aba onde se resolve, e a hora da conferência fica à vista, então "Conferir de novo" mostra que fez algo. A regra fica em `situacaoDiagnostico`, com teste: banco corrompido e chave de exemplo são perigo; nenhuma cópia, cópia de 7 dias ou mais, agentes com erro e chave ausente são alerta.
  - **Integrações:** Discord e Atualizador em dois cartões, com um Salvar só. A barra de salvar fica presa no pé da tela enquanto há alteração. O aviso da chave dos agentes virou um bloco com o texto inteiro, em vez de um selo espremido.
  - **Pessoas e permissões:** avatar com iniciais na cor do papel, contagem por papel em cima da tabela e busca por nome, usuário ou papel.
  - **Backups:** cada cópia mostra há quanto tempo foi feita.
- **Correção — Diagnóstico mostrava "Última cópia: Nenhuma ainda" com cópias no disco (01/10/2026):** a Saúde lia `data` de cada backup, mas `listarBackups` nunca devolveu esse campo. O teste da Saúde usava um dublê que já trazia `data` e por isso não pegou. Agora `listarBackups` devolve `data` (ISO, a partir do carimbo do nome do arquivo), e um teste novo usa o `BackupService` de verdade.

- **Configurações, visual — V2 (01/10/2026):**
  - **Interface e acessibilidade:** o "Perfil rápido" abre a aba (antes ficava no fim de "Personalização avançada", achado só por quem já tinha mexido em tudo). A prévia ganhou texto com link, selos de situação, campo e botões, porque a cor de destaque, o contraste e o tamanho do texto aparecem muito mais nessas peças do que numa tabela. Os textos de ajuda longos foram encurtados.
  - **Regras da equipe:** a aba mostra os valores de agora em blocos (prazo depois da versão oficial, dias sem atualização, arquivamento de tarefas e Atualizador). Antes eram dois parágrafos e um link para a Administração, onde quem não é admin nem entra. O administrador ganha em cada bloco o botão "Mudar na Administração", que abre a aba certa. Embaixo, "Só para você" e "Para toda a equipe" ficam lado a lado. A busca das Configurações acha cada regra.
  - **Trabalho diário e Notificações:** em tela larga os cartões ficam em duas colunas, com o rótulo perto do controle e menos rolagem.
  - **Horário silencioso:** "Das", "Até as" e "Falhas de agente avisam mesmo assim" ficam apagados e travados enquanto o silêncio está desligado.
  - **Conta:** o botão "Trocar senha" fica na mesma linha dos campos (o rodapé próprio deixava uma faixa vazia), e o aviso de senha aparece só quando há o que dizer. O cartão "Administração da equipe" saiu, porque se repetia no menu e em Regras da equipe.

- **Sobre e ajuda redesenhada — V1 (01/10/2026):** a aba deixou de ser desenhada como as de ajustes. Eram cinco cartões de "título + texto cinza", uns quarenta blocos de mesmo peso em cerca de 3.500px, e a versão era uma linha qualquer. Agora a aba abre com um cartão de destaque (marca, versão e atalhos para Novidades, Atalhos e, para administrador, Diagnóstico) e tem um índice lateral fixo que acende a seção que está sendo lida. Em tela estreita o índice vira uma fileira de botões em cima. As novidades viraram linha do tempo agrupada por data, com as três últimas à vista e o resto atrás de "Ver mais". "Como usar cada tela" virou uma grade de cartões que abrem no lugar: fechado, mostra o ícone e a frase do menu; aberto, o texto completo e um botão que leva à tela. As situações aparecem com a mesma bolinha colorida do Resumo, o prazo da equipe fica num selo, e as duas regras de combinação ficam num bloco à parte, porque não são situações. Os atalhos ficam em duas colunas equilibradas, e o suporte em dois cartões lado a lado. A busca das Configurações continua achando cada bloco: abre a novidade escondida ou o cartão da tela antes de acendê-lo. O índice usa botões, e não âncoras `#`, porque o roteador do app usa o hash da URL.

- **Alertas de segurança do CodeQL (01/10/2026):** download do banco atual, download de um backup e restauração passam a aceitar até 20 pedidos por IP a cada 15 minutos; o seguinte recebe 429 com "Muitos pedidos de backup seguidos". Sem isso, uma sessão de admin roubada ou um script em laço puxaria cópias do banco inteiro até esgotar disco e banda. Entra a dependência `express-rate-limit` no servidor: o `LimitadorDeLogin` caseiro conta por IP+usuário, específico do login, e o CodeQL só reconhece limitadores de bibliotecas conhecidas. A tela de "Falha ao inicializar o Gestor" passa a escapar a mensagem e a pilha do erro (eram jogadas cruas no `innerHTML`). Duas expressões regulares com tempo quadrático em entrada longa saíram: a que separa a lista de sistemas de uma atualização e a que tira a barra final da URL pública. O workflow de CI ganhou `permissions: contents: read`, o `brace-expansion` (via `nodemon`, só de desenvolvimento) subiu para a versão corrigida, e o `uuid` que o `exceljs` puxa é forçado para a 11.1.1 por `overrides` no `server/package.json` (o `exceljs` mais recente ainda pede `uuid@^8`; o painel não usa a parte do `exceljs` que chama o `uuid`, mas sem isso o alerta do Dependabot não fecha). Os demais alertas são falsos positivos: caminhos de arquivo já restritos à lista de backups ou a `path.basename`, o teste do webhook já restrito aos domínios do Discord, e CSRF e limite do login já cobertos por middlewares próprios que o CodeQL não reconhece.

- **Padrões do código — A18 (01/10/2026, em andamento):** nomes de classes, funções, métodos e arquivos em português no servidor e no cliente (por exemplo `ErroDeValidacao`, `exigirPapel`, `avisoRapido.sucesso`, `Servidor`, `BancoDeDados`, `CacheSwr`, `TabelaOrdenavel`); comentários no presente e sem a história do app original nem marcas de planos que não existem mais; `Servidor`, `SaudeService` e a Ficha 360° divididos em etapas nomeadas. Nada muda para quem usa o painel. O campo `precisaConfigurar` (antes `needsSetup`) da resposta de `/api/auth/status` mudou de nome nos dois lados; o Atualizador Automático não o usa.

- **Auditoria da documentação — A17 (30/09/2026):** README, CONTRIBUTING, SECURITY, CLAUDE.md, o runbook e a documentação consolidada foram conferidos contra o código (links e âncoras, caminhos citados, scripts do npm, variáveis do `.env`, rotas, nomes de tela). Corrigido o que estava falso: o card do Resumo e os filtros de Sistemas ainda citavam "Verificação pendente" e "Nunca atualizado" como grupos; "Administração → Atualizador" e "→ Saúde do servidor" eram abas que hoje se chamam Integrações e Diagnóstico; o runbook mandava consultar uma rota do agente que não existe (`/agente/status`, a real é `/update/status/:cnpj`); o CONTRIBUTING e o CLAUDE.md mandavam rodar um script de testes de navegador que saiu do repositório; a SECURITY dizia que o histórico de dependências estava no CHANGELOG (está no README); e havia contagens de testes e um gráfico de pizza que já não existem. Os 30 links para o `MELHORIAS.md` removido (e para âncoras escritas à mão que quebravam) foram tirados, e os comentários de código que citavam os itens do plano passaram a citar o ADR. Na documentação consolidada entram o ADR-0014 ("atualização" como termo único) e as revisões dos ADRs 0005 e 0006 (as pastas sem DOM) e 0012 (a suíte de navegador foi revogada), além da seção 7.3 sobre o fim do `MELHORIAS.md`.

- **Organização — A16 (30/09/2026):** cada arquivo na pasta que a regra do projeto manda. No front-end, cinco arquivos de `utils/` e `domain/` tocavam o documento (download de arquivo, botão ocupado, `el()`, copiar para a área de transferência, leitura de variável CSS e o bloco visual de retorno do agente) e foram para `components/` e `app/tema.js`; o portão "sem DOM" só parecia existir (o `tsconfig` tinha `dom` nas libs e o teste só olhava `templates/` e `domain/`), e agora o `tsc` roda sem `dom` e o teste cobre `utils/` também. No servidor, `shared/` ficou com `errors` e `normalizacao`, os dois que têm consumidores em camadas diferentes: paginação, ordenação e validação tinham uma camada só e foram morar nela; `separarSistemas` e `primeiraMaiuscula` subiram para a normalização; e os serviços deixaram de usar a conexão direto (`BancoDeDados` ganhou `transacao`, `verificarIntegridade` e `modoDeGravacao`). Sem mudança de comportamento. Os testes seguiram: um arquivo por regra (validação, paginação, ordenação, saúde). Sete arquivos com nome fora do padrão (classe em camelCase, função em PascalCase) e `UsuariosController` e `NotificacaoService` foram renomeados.

- **Limpeza — A15 (30/09/2026):** varredura do repositório atrás de tudo o que não tinha uso. Saíram cinco rotas da API que nem o cliente, nem o Atualizador, nem os testes chamavam: em Atualizações, `last-by-client` e `versoes-por-sistema`; em Agendamentos, `excluir-lote`, `concluir-lote` e `gerar-lote` (sobra de quando a tela era uma tabela, o quadro Kanban não tem seleção múltipla), com o código e os testes que só elas usavam. Saíram também métodos de repositório sem chamador, código do front-end, 12 classes e 10 variáveis de CSS sem uso. `--raio-md` era usada em 4 lugares sem nunca ter sido definida, então os menus "Relatórios" e "Mais ações" de Atualizações, o painel de versões oficiais, a linha do "Antes × Depois" e o tooltip do gráfico de barras ficavam de canto reto; passam a usar `--raio`. O servidor deixou de depender do próprio repositório (`"gestor-de-atualizacoes": "file:.."`, que entrou por engano em 18/09): o Dockerfile ficou mais simples e o atalho circular que essa dependência criava em `server/node_modules` deixou de existir. No CI, o passo de testes de navegador saiu, junto com o script `test:navegador`: a pasta `navegador/` já não está no repositório, então o passo não testava nada.
- **Tela de login — A12 (30/09/2026):** em tela larga, a tela se divide em duas metades: a marca num painel tingido com a cor de destaque e o formulário na outra. O logo e o nome apareciam duas vezes, porque a regra que escondia os do cartão perdia para a regra base no CSS. No celular fica só o formulário, com o logo e o nome em cima. Ao entrar, o botão diz "Entrando…" e os campos travam até a resposta. O erro ganhou espaço, borda e sinal de alerta, marca os campos em vermelho (e para o leitor de tela) e some ao começar a corrigir. Antes de o app carregar, a página mostra "Carregando o Gestor…" em vez de ficar em branco. Mostrar senha e aviso de Caps Lock continuam; tudo revisto no tema claro e no escuro, sem biblioteca nova.

- **Sobre e ajuda reorganizada — A11 (30/09/2026):** a aba de Configurações passa a ter cinco blocos: versão e novidades; como usar cada tela (só as que a pessoa vê no menu); atalhos de teclado num cartão só, com um título por grupo (antes cada grupo era um cartão solto); como a situação é calculada, item por item e com o prazo que a equipe usa de verdade; e contato e suporte. A versão mostrada vem do servidor e é a mesma do Diagnóstico: havia três números diferentes ("2.0" no Sobre, "2.1.0" fixo no Diagnóstico, "1.0.0" no `package.json`), e agora o `package.json` é a fonte única (2.1.0). O `/auth/status` passou a mandar a versão, e o app busca as regras de novo depois do login (antes, quem entrava pela tela de login ficava sem elas).

- **Filtros da tela Sistemas — A10 (30/09/2026):** a barra segue o padrão de Atualizações: contagem e botões "Filtros" e "Versões oficiais" à direita, "Limpar filtros" quando há situação, busca ou data escolhida, e "Filtros (1)" quando a data está valendo com o painel fechado. No painel, o "Limpar data" fica alinhado ao campo; a dica que havia embaixo saiu, e data inválida fica marcada no próprio campo.

- **Títulos em Administração e Configurações — A09 (30/09/2026):** o título de um cartão ("Histórico de atualizações", "Regras globais") e o nome de cada configuração dentro dele saíam do mesmo tamanho e peso, e o cartão parecia só mais uma linha da lista. Agora são três níveis: título da seção (o da aba, maior e com linha divisória, e o de cada cartão), nome da configuração (médio, em negrito) e descrição (pequena, em cor secundária). Vale em todas as abas das duas telas, inclusive na classificação dos sistemas, nos blocos de Diagnóstico e na legenda dos papéis.

- **Correção do prazo e fim da "Verificação pendente" — A07 (30/09/2026, depois da publicação):** o prazo contava só da data da versão oficial, e o Resumo não mostrava nenhum desatualizado — cliente parado havia quase um ano ficava "aguardando" porque a oficial do B_Vendas era recente. Agora é **desatualizado** também quem teve a última atualização 60 dias ou mais antes da oficial; "aguardando" fica só para quem foi atualizado pouco antes dela, dentro do prazo. **Nunca atualizado conta como desatualizado**: o grupo "Verificação pendente" saiu do card, e o filtro da aba Sistemas troca "Sem informação" por "Sem versão oficial". Vale para todos os sistemas (aba Sistemas, ficha, "Onde estão os atrasos"); o card continua julgando pelo B_Vendas quem o tem. A legenda das situações em Configurações foi reescrita (ainda descrevia a regra pela versão recebida). Revisão no [ADR-0013](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0013).

- **Gráfico "Atualizações por sistema este mês" — A08 (30/09/2026):** barras em ordem decrescente com o número no fim de cada uma e ▲/▼ com a diferença contra o mesmo período do mês anterior. No máximo 8 sistemas; os demais somados em "Outros". Sistemas zerados nos dois meses saem da lista (antes aparecia o catálogo inteiro, quase todo em zero). Clicar numa barra abre Atualizações filtrada pelo sistema e pelo mês, com o filtro visível num chip; sem atualização no mês, o card diz isso. O número passou a contar clientes atualizados no sistema durante o mês (e não só os que tiveram ali a última atualização), para a comparação com o mês anterior ser justa. A listagem, a exportação e o relatório de Atualizações aceitam o filtro `sistema`, pelo nome do catálogo.

- **NFCe e Consignado M2 pela data do B_Vendas — A13 (30/09/2026):** um cliente atualizado no B_Vendas não aparece mais atrasado nesses sistemas só porque a atualização não foi lançada para cada um. Nos clientes que têm B_Vendas, a situação deles usa a data da última atualização do B_Vendas, contra a versão oficial do próprio sistema e o prazo do A07. A aba Sistemas e a ficha avisam "pela data do B_Vendas". A marcação "Atualiza junto com o B_Vendas" fica em Administração › Operação da equipe, e a migração 6 já marca os dois. Registrado no [ADR-0013](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0013).

- **Prazo antes de "desatualizado" — A07 (30/09/2026):** uma versão oficial recém-publicada não deixa mais todos os clientes vermelhos no dia seguinte. Quem ainda não recebeu a versão fica **Aguardando atualização** (cinza) até N dias depois da data da versão oficial, e só então **Desatualizado**. N é a regra nova "Desatualizado depois da versão oficial" em Administração › Operação da equipe (padrão 60; 0 volta à regra estrita). Vale no Resumo, na aba Sistemas (com filtro próprio) e na ficha, que sem agente passou a mostrar a mesma situação do Resumo em vez de comparar com a versão publicada pelo Atualizador. O card "Atualização dos Clientes" diz o prazo usado e perdeu a nota de rodapé que repetia a lista. Campanhas não usam o prazo. Decisão no [ADR-0013](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0013).

- **"Atualização" como termo único — A14 (30/09/2026):** o termo antigo para o registro saiu do projeto inteiro — telas, nomes internos, comentários, documentação e as entradas antigas deste histórico. O registro é uma **atualização**, e a data que importa é a **última atualização**. O contador do Resumo passou a se chamar `semAtualizacao`, e o filtro de data da aba Sistemas usa o parâmetro `atualizacaoAntesDe`; a data que já estava salva no navegador continua valendo. `client/tests/vocabulario.test.mjs` falha se o termo voltar.

- **Tabelas na altura da tela — A06 (30/09/2026):** em Clientes, Atualizações, Sistemas e Agendamentos a altura da tabela deixou de ser um percentual fixo da janela, que não descontava cabeçalho, filtros e paginação. Agora ela é medida pelo espaço que sobra: em "Cheia" vai até o fim da página, sem faixa vazia; em "Alta" e "Média" o percentual vira teto. Em nenhum modo a página e a tabela rolam ao mesmo tempo. No celular só a página rola. No quadro de Agendamentos, cada coluna rola por dentro em vez de esticar a página.

- **"Nova Campanha" na Ação rápida — A05 (30/09/2026):** o atalho Alt+N passa a oferecer Nova Campanha, que abre direto o formulário da campanha. Para quem só consulta, o botão aparece desativado, como os demais.

- **Clientes abre sempre por ID crescente — A04 (30/09/2026):** ao entrar na tela, a lista volta à ordem de cadastro (ID 1, 2, 3…). A ordenação escolhida vale enquanto se está na tela e deixou de ser lembrada na próxima abertura; a busca continua sendo.

- **Regime tributário na Ficha 360° — A03 (30/09/2026):** o regime gravado no cadastro do cliente passa a aparecer na ficha, em Resumo & Cadastro ("—" quando vazio) e no cabeçalho, junto de cidade e grupo.

- **Avisos sobre formulários — A02 (30/09/2026):** nos avisos de campo obrigatório e data inválida (Clientes, Atualizações, Agendamentos e Acessos), o foco ia para o campo *atrás* do aviso ainda aberto: o Enter seguinte reenviava o formulário e empilhava outro aviso, e pelo teclado a tela parecia travada. Agora o foco fica no aviso e volta ao campo quando ele fecha. As camadas da tela (faixa de conexão, gaveta, modal, notificação) passaram a sair de uma escala única de variáveis `--camada-*` em `theme.css`, com teste que recusa número solto e confere a ordem.

- **Quadro de Agendamentos não trava mais na segunda mudança de status — A01 (30/09/2026):** depois de mover uma tarefa (arrastando ou pelo formulário), a mudança seguinte da mesma tarefa — tirá-la de "Em Andamento", por exemplo — era recusada com "Este agendamento foi atualizado por…" com o nome da própria pessoa, e o quadro só voltava a aceitar mudanças com F5. O servidor devolvia a tarefa salva sem a revisão nova, e a tela seguia mandando a antiga. Agora a resposta traz a revisão atual; num conflito de verdade (outra pessoa mexeu), o quadro recarrega sozinho. O arrasto de coluna também deixou de ser confundido com o último cartão arrastado.

- **Situação dos clientes pela data da atualização (29/09/2026):** a versão recebida não decide mais se o cliente está em dia — vale só a data da última atualização contra a data da versão oficial (ou da versão-alvo, em Campanhas). Quem foi atendido depois da oficial conta como em dia mesmo com uma versão anterior gravada. A coluna "Versão recebida" saiu da aba Sistemas e a marca "(pela data)" saiu das telas. A versão recebida continua gravada e aparece na ficha, no relatório e na exportação da campanha. Revisão registrada na [ADR-0008](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0008).
- **Formulário de campanha:** o campo Descrição não fica mais colado no Cidade.

- **Limites e medição da importação/exportação — P05 (29/09/2026):** medido com `server/ferramentas/medir-planilhas.js` na máquina de produção: importar 20 mil linhas custava 21 s e 1 GB de memória, 50 mil custavam 1,75 GB — o bastante para derrubar o painel de todo mundo, e o limite de 15 MB do upload não impedia (15 MB são ~400 mil linhas). Números completos no runbook (`docs/OPERACAO.md`, "Lentidão") e em `server/src/config/limitesPlanilha.js`.
  - *Limites*: 5.000 linhas por importação e 10.000 por exportação (`server/src/config/limitesPlanilha.js`), anos de folga sobre o volume real (~1.000 atualizações por ano). Acima disso, a mensagem diz o limite e o que fazer (dividir o arquivo; filtrar por período), e nada é gravado.
  - *Recusa antes de carregar*: a importação conta as linhas direto no zip do .xlsx, sem montar a planilha, e recusa um arquivo grande em ~0,1 s. O leitor em fluxo do ExcelJS, que seria o caminho natural, falha de forma intermitente na versão 4.4.0 e foi descartado.
  - *Importação 2 a 3 vezes mais rápida e com um terço da memória*: o SQL era compilado de novo e o catálogo de sistemas relido a cada linha.
  - *Mensagens*: arquivo grande demais (413) ou de formato errado (400) deixam de responder "Erro interno do servidor"; a exportação recusada passa a aparecer na tela (antes, não acontecia nada); célula com texto formatado deixa de entrar como `[object Object]`.
  - *Testes*: `server/tests/limitesPlanilha.test.js` e um passo em `navegador/atualizacoes.test.mjs`.

- **Testes de navegador — P04 (29/09/2026):** `npm run test:navegador` roda os fluxos completos num Chrome sem janela: login e sessão expirada, atualizações (criar, editar, conflito de revisão, falha da API no envio, filtro, relatório copiado, excluir e desfazer, exclusão em lote com confirmação), tarefas, campanhas, importação, teclado e foco, nome acessível e rolagem horizontal em 390/768/1280/1440 px, nos dois temas e com zoom de 200%. Sem dependência nova: o Chrome instalado é controlado pelo protocolo de depuração ([ADR-0012](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0012)). Roda no CI.
  - *Modal atrás da gaveta*: "Descartar alterações?", o erro ao salvar e o aviso de conflito abriam **escondidos** atrás do formulário (camada 1100 contra 1200). Esc e Salvar pareciam não fazer nada. Agora o modal fica acima da gaveta, e os avisos acima de tudo.
  - *Gaveta e teclado*: ao fechar, o foco volta para quem a abriu (antes caía no começo da página); o Tab circula dentro dela em vez de escapar para a tela de trás; o fundo deixa de engolir o clique seguinte enquanto some.
  - *Login*: os campos ganharam rótulo associado (o leitor de tela anunciava só "caixa de texto") e o erro de senha passa a ser anunciado.
  - *Agendamentos*: os filtros de Status e Prioridade tinham o mesmo id dos campos do formulário, e um dos dois ficava sem nome acessível.

- **Aviso de dados desatualizados — P03 (29/09/2026):** quando uma tela não consegue atualizar, ela diz isso. Antes o dado anterior ficava na tela em silêncio, parecendo atual. Agora aparece no topo "Não foi possível atualizar. Mostrando os dados de hoje às 14:32.", com o motivo e o botão **Tentar novamente**. Sem dado anterior: "Não foi possível carregar os dados desta tela.". O aviso some sozinho quando a busca volta a dar certo, inclusive na volta da conexão.
  - *Motivo em palavras de quem usa*: sem conexão, painel fora do ar, servidor demorando, erro do servidor ou recusa (com a mensagem do servidor). Sessão expirada continua indo para o login, e troca de filtro ou de aba não gera aviso falso.
  - *Um aviso, não uma pilha de toasts*: o toast "Não foi possível carregar os dados desta tela", que voltava a cada tentativa, não aparece mais nas telas que mostram o aviso.
  - *Vale para todas as telas que usam o cache*, porque mora na `View.swr` (`client/js/utils/estadoDados.js`).
  - *Telas que escapavam do aviso*: Clientes e Sistemas buscavam a primeira coisa fora do cache e, com o servidor fora, nem desenhavam o dado guardado; Campanhas e Sistemas abriam um modal de erro por cima. Achado no teste de navegador com o servidor derrubado.
  - *Faixa de "sem conexão" com o proxy*: com o Caddy da P01, o painel fora do ar respondia 502 pelo proxy e a faixa nunca aparecia. O `ApiPainel` passa a contar 502/503/504 como queda.
  - *Testes*: `client/tests/estadoDados.test.mjs` e o caso do 502 em `client/tests/apiclient.test.mjs`.

- **Proteção CSRF — P02 (29/09/2026):** toda escrita da API feita com sessão (POST, PUT, PATCH, DELETE, inclusive upload de planilha e de pacote) passa a exigir o token da sessão no cabeçalho `X-CSRF-Token`. Outra página aberta no navegador de quem está logado não consegue mais alterar nada em nome dessa pessoa. Antes, `SameSite=Lax` e "só JSON" barravam o caso comum, mas não um formulário multipart nem os POST sem corpo (publicar versão, sair). Decisão em [ADR-0011](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0011).
  - *Invisível para quem usa*: o servidor entrega o token em toda resposta com sessão, e o `ApiPainel` o devolve sozinho. Se a pessoa entrou de novo em outra aba (sessão nova, token novo), o pedido recusado é repetido uma vez com o token atual. Sessões abertas antes da atualização ganham o token na primeira chamada, sem precisar entrar de novo.
  - *Fora da regra*: login e configuração inicial (não há sessão antes deles) e pedidos sem sessão, que continuam recebendo o 401 que leva ao login. Os agentes C# não são afetados.
  - *Testes*: `server/tests/csrf.test.js`, `client/tests/apiclient.test.mjs`; os testes HTTP antigos passam a devolver o token como o navegador.

- **Somente HTTPS na rede — P01 (29/09/2026):** o painel deixa de atender `http://IP:3000`. A equipe passa a acessar `https://gestoratualizacao` (ou `https://IP`). Decisão em [ADR-0010](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0010).
  - *Docker com proxy*: o `docker-compose.yml` sobe o painel e um Caddy na frente. O painel não publica porta; o Caddy atende só a 443 (sem a 80, nem para redirecionar) e emite o certificado com autoridade própria, instalada uma vez em cada PC. Endereço no `web/.env` (`GESTOR_ENDERECO`, e `GESTOR_IP` para o acesso por IP: o navegador não manda SNI para IP e, sem a dica, o Caddy não entregava certificado nenhum — pelo nome abria, pelo IP não).
  - *Servidor*: sem HTTPS, escuta só em `127.0.0.1` (desenvolvimento). Com HTTPS, recusa com 403 o que não vier pelo proxy — inclusive o POST do login, que antes passaria a senha em texto puro por `http://IP:3000` mesmo com o cookie `Secure`. HSTS e `upgrade-insecure-requests` só com HTTPS.
  - *Subida recusada, em vez de falha silenciosa*: `SESSION_SECURE=true` sem `TRUST_PROXY` (antes: "ninguém consegue entrar", sem erro) e valores fora de `true`/`false` (antes: `SESSION_SECURE=1` virava `false` calado).
  - *Removido o que não se usa mais*: instruções do serviço do Windows (os scripts já tinham saído), o volume e a pasta `server/logs/` (só o NSSM escrevia nela; o log agora é `docker compose logs`), e o conselho de `SESSION_SECURE=false` na rede local.
  - *Testes*: `server/tests/transporte.test.js`.

- **Documentação consolidada (28/09/2026):** `docs/` passou a manter apenas
  Operação, Melhorias e Documentação Consolidada. O plano vigente foi integrado
  a Melhorias; o plano de revisão concluído e os ADRs 0007–0009 foram
  incorporados à Documentação Consolidada. O `README.md` da raiz virou o índice.
  Pedidos gerais de melhorias deixam o Atualizador Automático fora do escopo
  enquanto estiver pausado, salvo pedido explícito em contrário.

- **Correções da revisão de código da branch (28/09/2026):**
  - *Importação — duplicidade*: a chave usava o sistema como veio da planilha e na ordem em que veio. "Vendas" não casava com o "B_Vendas" gravado, nem "B_NFe, B_Vendas" com "B_Vendas, B_NFe", e reimportar o mesmo arquivo com "pular duplicidades" duplicava o histórico mesmo assim. Agora os sistemas são resolvidos no catálogo e ordenados, numa função só (`chaveDuplicidade`) usada dos dois lados.
  - *Importação — planilha sem cabeçalho*: a leitura começava sempre na linha 2, e a primeira atualização sumia em silêncio (os dados dela apareciam como "colunas ignoradas"). Sem cabeçalho, a linha 1 já é dado.
  - *Importação — Auditoria*: importação que não gravou nada não registra mais "criar atualização: 0 importados".
  - *Campanhas*: tarefa "Sem resposta" deixava o cliente como "Já agendado", fora dos pendentes e sem o botão Agendar; agora conta como pendente (a mesma leitura dos lembretes). Encerradas saem da encerrada mais recentemente para a mais antiga (o prazo passava na frente). A lista consulta clientes e atualizações uma vez por sistema, e não uma vez por campanha.
  - *Preferências*: um valor fora do formato recusava o conjunto inteiro, e como o cliente envia tudo junto, um valor velho travava em silêncio a sincronização de todas as preferências. Agora só aquele valor é descartado.
  - *Atalhos*: com a aba Campanhas, a Administração virou a 10ª aba e perdia o Alt+9 sem atalho novo (e o comentário dizia que nada mudava). A 10ª aba passa a ser **Alt+0**; o teste do dígito também impede que Alt+Espaço vire "décima aba".
  - *Configurações*: o ouvinte de mudança da permissão de notificação agora se desliga quando a linha sai da tela.

- **Polimento visual após o fechamento do planejamento (28/09/2026):**
  - *Resumo, card "Atualização dos Clientes"*: o "% em dia" virou o número principal, com "N de M clientes" ao lado; a barra ficou mais grossa e mostra o total de cada segmento ao passar o mouse; "Onde estão os atrasos" mostra, para cada sistema, atrasados sobre quantos clientes o usam ("196 de 250"), com mini-barra e %. Antes, "196 clientes" sozinho não dizia se era quase todo mundo. Continuam os três primeiros e "Ver todos" (decisão da seção 5.1 do planejamento). O servidor passou a mandar `clientes` em `sistemasMaisAtrasados`.
  - *Administração*: cartões de cada seção com espaço entre si (vinham encostados: a classe do contêiner não tinha regra de CSS); rodapé de salvar encaixado no cartão; Classificação dos sistemas em linhas curtas, em duas colunas, com Atualizável/Fixo em botões colados e Salvar só na linha alterada — antes cada sistema tinha seletor e Salvar empilhados; em Dados, "atualizações" virou "atualizações" e os botões ganharam borda.
  - *Tabelas no celular*: em Atualizações e Clientes a coluna Cliente simplesmente não aparecia. Com `table-layout: fixed`, as colunas de largura fixa já passavam da largura da tela, as colunas em % (Cliente, Sistema) ficavam com largura zero, e o contêiner cortava o excesso sem deixar rolar. No celular, a tabela ganha largura mínima e rola na horizontal; as que já viram blocos (Campanhas, Distribuição, prévia da importação) ficam fora.
  - *Atualizações*: o "+ Nova Atualização" quebrava sozinho para uma segunda linha em 1440 px; a barra cabe numa linha.
  - *Agendamentos*: a coluna "Concluído" do quadro ficava cortada à direita (colunas com mínimo de 340 px); com 220 px as quatro cabem a partir de 1280 px.
  - *Clientes*: cabeçalho "Máquinas" cortado ("MÁQUI…"); coluna com 92 px.
  - *Configurações*: a aba "Sobre e ajuda" ficava cortada atrás da busca e sem ícone (pedia `info`, que não existia). A busca sobe para cima das abas quando não cabe ao lado; o ícone foi criado; e um teste novo exige que todo ícone pedido pelo nome exista.

- **Planejamento 13.4 e fechamento da revisão (28/09/2026):** preferências de notificação e de relatório, polimento da aba Campanhas e o [planejamento](docs/DOCUMENTACAO_CONSOLIDADA.md#plano-revisao-concluido) marcado como **finalizado**.
  - *O que o sino conta*: interruptor por tipo (agendamentos atrasados, de hoje, situação dos agentes) e escopo **Da equipe / Só as minhas**. O que fica desligado some do sino e do contador no título da aba. "Minha" tarefa é decidida por `ehResponsavel` (domain/pessoa.js): o Responsável costuma ser só o primeiro nome ("Antonio") e a conta tem o nome inteiro ("Antonio Salomão"); comparar os textos inteiros diria "não é minha" para quase tudo.
  - *Som*: opcional e desligado por padrão; toca quando o número de pendências não vistas cresce (não a cada ciclo de cinco minutos) e quando chega falha de agente. Gerado no navegador, sem arquivo de áudio.
  - *Horário silencioso*: de meia em meia hora, pode virar a noite, pelo relógio do computador (o fuso aparece na tela, sem conversão). Falha de agente é o evento crítico: por padrão passa sem som; desligando, as falhas do período viram um aviso-resumo ao fim do silêncio.
  - *Permissão do navegador*: a tela diz o estado real (permitidas, bloqueadas — com como liberar —, não pedidas, indisponível em HTTP), relido do navegador, e não o que a preferência lembrava.
  - *Relatório*: aba inicial (Atualização ou Cliente) e "fechar depois de copiar"; o conteúdo do chamado não muda. A aba "Atualização" virou "Atualização".
  - *Validação das preferências no servidor*: nome de chave com formato (antes qualquer texto virava chave, inclusive `__proto__`) e valor conferido nas chaves que mudam comportamento. O cliente não envia chave antiga fora do formato, para ela não travar a sincronização das demais.
  - *Campanhas, visual*: cartão da altura da tela com lista e detalhe rolando cada um por si; sem campanhas, um só aviso centralizado (antes eram dois, um espremido no canto); Ativas/Encerradas alinhado com "Nova campanha"; placar em painel com o percentual em destaque; prazo não aparece mais duas vezes; busca na linha dos filtros.
  - *Textos*: "atualização" virou "atualização" onde aparecia na tela (Administração › Dados e Operação, paleta, ajuda das situações).
  - *Testes*: `client/tests/notificacoes.test.mjs`, casos novos em `preferencias.test.mjs` e `historicoPreferencias.test.js`.

- **Revisão do painel, E11 (fechamento do planejamento, 28/09/2026):** Campanhas de atualização, importação com prévia e as últimas pendências de botões e acessibilidade. Com isto, todas as etapas E0–E11 do [planejamento](docs/DOCUMENTACAO_CONSOLIDADA.md#plano-revisao-concluido) estão concluídas.
  - *Campanhas (nova aba, grupo Distribuição)*: meta temporária de versão por sistema ("B_NFe na 25/09/2026 até o dia 30"), com barra de progresso (atualizados, já agendados, pendentes), filtros rápidos com contagem, busca, botão **Agendar** na linha (cria a tarefa com o sistema da campanha), gerenciar acessos, abrir a ficha e exportação dos pendentes em `.xlsx`. **Não há baixa manual**: registrar a atualização com a versão da meta, ou mais nova, tira o cliente dos pendentes — pela mesma regra da ADR-0008, inclusive "pela data". A versão-alvo é copiada na criação e não muda com uma oficial nova; encerrar congela o placar; excluir é só do admin e não apaga atualizações nem tarefas. Migração 4 (tabela `campanhas`, só a meta: os clientes vêm ao vivo do cadastro). Decisão em [ADR-0009](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0009).
  - *Atalhos das abas*: com a décima aba, a partir dela não há Alt+N — e a aba deixou de anunciar um "Alt+10" que não funcionava. Campanhas entrou depois de Sistemas para não mudar o número das abas que a equipe já usa.
  - *Importação de planilha*: virou um fluxo em três passos (orientação do formato → prévia → resultado), em Atualizações › Mais ações e em Administração › Dados. A prévia (`POST /atualizacoes/import/previa`) não grava nada. **Mudança de comportamento:** linha com data fora de dd/mm/aaaa, que antes entrava assim mesmo, agora fica de fora; possíveis duplicidades (mesmo cliente, data e sistemas) são avisadas e puladas por padrão — o caso comum era reenviar o mesmo arquivo. O lote grava numa transação só: antes, uma falha no meio deixava parte do arquivo dentro sem aviso. Arquivos `.xls` (formato antigo) são recusados com mensagem clara: o leitor só entende `.xlsx`. O Histórico registra importadas e ignoradas.
  - *Botões e acessibilidade (seção 6)*: botão processando não parece mais desabilitado (fica legível, com spinner e cursor de progresso); em tela de toque os botões só de ícone passam de 26 para 40 px, sem mudar o desktop; os "×" da gaveta e do relatório ganharam dica; nova trava `client/tests/acessibilidade.test.mjs` (todo `btn--icon` com `aria-label` e `title`). Auditoria no navegador em todas as abas, barra aberta e recolhida: nenhum botão sem nome acessível, largura inteira aproveitada.
  - *Atualizações*: colunas Versão e Data cortavam o ano ("26/09/2…"); passaram a 96 px.
  - *Ficha do cliente*: "Última atualização" virou **Última atualização** ("Nenhuma atualização" quando não há), e o cartão **Situação dos sistemas** saiu — repetia, resumido e com defeito ("2 2 pendentes"), o que a subaba Matriz de Versões mostra por sistema. A nota da telemetria dizia que a versão oficial vinha das atualizações, o que não é verdade; agora diz que a situação vem das atualizações registradas.
  - *Clientes*: saiu o botão **Copiar acessos** da linha; fica só **Gerenciar acessos**, onde cada identificador tem cópia própria. O papel Consulta, que só via o botão de copiar, consulta os acessos na ficha do cliente (subaba Acessos Remotos).
  - *Testes*: `server/tests/campanhas.test.js`, `server/tests/importacao.test.js` (o importador não tinha nenhum teste), migração 4 em `migracao.test.js`, `client/tests/campanhas.test.mjs` e `acessibilidade.test.mjs`. O teste da migração 3 passou a remover também as campanhas ao simular um banco na versão 2.

- **Revisão do painel, E10:** validação visual completa, revisão da documentação e encerramento do ciclo principal:
  - *Documentação (`README.md`)*: atualizado para refletir o design e fluxos consolidados da revisão:
    1. Agendamentos: remoção definitiva de menções legadas a "converter agendamento em atualização", documentação da toolbar unificada, filtros rápidos (Pendentes, Concluídos, Arquivados) e arquivamento manual de concluídas;
    2. Atualizações: documentação de filtros recolhíveis com chips visuais e menu "Mais ações" para exportação e importação;
    3. Sistemas: documentação da divisão entre consulta de clientes (com filtros por situação e busca) e painel "Versões oficiais" com autoria e detecção de edição concorrente;
    4. Clientes e Consulta: documentação da gestão de acessos na linha de cada cliente com cópia rápida, formato compacto de Grupo/Rede e linha do tempo com cópia de relatório em texto limpo;
    5. Administração e Configurações: documentação da reestruturação em 7 e 6 seções temáticas, respectivamente;
    6. Limitações: remoção de menção desatualizada a "apenas dois níveis de permissão", alinhando com o modelo RBAC de três perfis (Administrador, Operador, Consulta).
  - *[Planejamento concluído](docs/DOCUMENTACAO_CONSOLIDADA.md#plano-revisao-concluido)*: conclusão da etapa E10 no cronograma e checklist mestre; validação e preenchimento de todos os critérios gerais de aceite (regras e dados, interação, acessibilidade visual e engenharia).
  - *Validação de acessibilidade e visual*: garantia de consistência de contraste, foco visível, responsividade nos breakpoints (390px, 768px, 1280px e 1440px) e compatibilidade com os modos claro e escuro.

- **Revisão do painel, E8:** reorganização das telas de Administração e Configurações por finalidade de uso (I18 e I19):
  - *Administração (`AdministracaoView`)*: reestruturada em 7 seções por finalidade de operação:
    1. **Pessoas e permissões** (`UsuariosAdmin`): usuários, papéis e gestão de contas;
    2. **Operação** (`OperacaoAdmin`): unificação de prazos (dias até desatualizado e arquivamento de tarefas) e classificação dos sistemas (atualizável vs componente fixo);
    3. **Dados** (`DadosAdmin`): centralização de exportação completa de atualizações (.xlsx), importação em lote com validações e download do banco SQLite de agora;
    4. **Integrações** (`IntegracoesAdmin`): alertas externos via Discord Webhook com teste imediato, liga/desliga do Atualizador e conectividade;
    5. **Backups e recuperação** (`BackupsAdmin`): cópias do banco com verificação de integridade, restauração protegida e política configurável de retenção de cópias automáticas;
    6. **Auditoria** (`HistoricoView`): auditoria completa de alterações com cabeçalho limpo e contextualizado;
    7. **Diagnóstico** (`SaudeAdmin`): saúde do servidor, integridade do banco e status de processos.
    Redução de descrições repetitivas, migração transparente de abas legadas na sessão e atualização dos atalhos da paleta.
  - *Configurações (`ConfiguracoesView`)*: reorganização das preferências pessoais em 6 seções claras:
    1. **Minha conta** (`ContaConfig`): abertura padrão com perfil, troca de senha, sessões ativas e backup de preferências;
    2. **Trabalho diário**: tela inicial, período de abertura, paginação, menu lateral, persistência de filtros e confirmação de logout;
    3. **Notificações**: avisos na tela (posição e duração), contador no título da aba e notificações no Windows;
    4. **Interface e acessibilidade**: tema, realce, contraste, tamanho do texto, densidade de linhas com prévia ao vivo e personalização avançada recolhida (fontes, texturas e ultrawide);
    5. **Regras da equipe** (`RegrasEquipeConfig`): orientação clara da separação entre escolhas pessoais e regras globais, com atalho direto para a Administração;
    6. **Sobre e ajuda**: versão do painel, guia conciso das situações de versão dos sistemas e catálogo completo de atalhos de teclado.
    Todas as 24 chaves de preferências salvas no navegador foram estritamente preservadas.

- **Revisão do painel, E7:** ficha do cliente (`ConsultaView`) revisada:
  remoção de referências a CNPJ no subtítulo e nos campos de cadastro; cabeçalho
  compacto exibindo Código, Cidade e Grupo/Rede (quando preenchido); resumo
  compacto com última atualização relativa e situação de sistemas; separação clara
  entre sistemas atualizáveis (classificados pela regra oficial do servidor/ADR-0008),
  componentes fixos sem status de atraso e bloco dedicado de telemetria de agentes
  instalados (sem interferir na situação de versão do cliente). Na linha do tempo de
  atualizações, adicionado botão para copiar o chamado no formato padrão. O modal de
  relatórios (`RelatorioModal`) substituiu o seletor por abas curtas (Atualização e
  Cliente), cabeçalho discreto com botão fechar, filtro de histórico recolhível e
  prévia com rodapé estável de ações (Fechar, Imprimir/Salvar PDF e Copiar texto).

- **Revisão do painel, E6:** agendamentos integrados à grade com toolbar unificada,
  criação rápida de tarefas e filtros de status discretos (Pendentes, Concluídos e
  Arquivados). Na aba Clientes, a gestão de acessos foi movida diretamente para a
  linha de cada cliente ("Gerenciar acessos"), a coluna Grupo/Rede foi compactada com
  truncamento controlado e o campo de cadastro foi reorganizado junto a Código e Cidade.

- **Revisão do painel, E5:** padronização do sistema de botões e toolbars
  (variantes `btn--primary`, `btn--secondary`, `btn--danger`, altura mínima 38px/32px
  e borda visível); filtros de data recolhíveis em Atualizações com chips visíveis e
  indicador de filtros ativos; e menu "Mais ações" consolidando Exportar recorte e
  Importar atualizações com orientações de uso.

- **Revisão do painel, E4:** tendência mensal do Resumo passa a mostrar 12
  meses consecutivos, com zero nos meses vazios e sem contar registros futuros
  como realizados. A unidade é atualização registrada; o mês atual é parcial
  e a variação usa períodos de igual duração. O gráfico ajusta rótulos à
  largura, usa segmentos retos e oferece leitura por teclado, toque e lista
  textual. O card de situação orienta conforme o tipo de estado vazio.

- **Revisão do painel, E3:** a aba Sistemas separa os filtros de consulta do
  painel Versões oficiais. A data de consulta agora filtra a última atualização
  e nunca substitui a referência oficial na classificação. A tabela ganhou
  filtros de situação e busca, mostra a oficial e abre a ficha do cliente. O
  gerenciador tem edição por linha, autor e data das alterações futuras e
  bloqueio de gravação quando outra pessoa mudou a referência antes do Salvar.
  As colunas de autoria são adicionadas pela migração 3 também aos bancos já
  existentes; a primeira implantação em Docker revelou que a criação inicial
  do esquema não alcançava instalações atualizadas.

- **Revisão do painel, E2:** componentes fixos saíram do gráfico por sistema,
  da seleção de Sistemas e das referências oficiais. A ficha os reúne em
  Serviços/componentes fixos, sem atraso. A API bloqueia nova referência e
  lotes de atualização por atraso, enquanto preserva atualizações e
  referências antigas. A classificação agora é administrada na aba própria,
  com permissão de administrador. Totais e tendência do Resumo passaram a
  dizer Atualizações para refletir a contagem de registros, inclusive de
  instalações e acessos.

- **Revisão do painel, E1:** retirado o comando de converter agendamento em atualização;
  tarefas concluídas podem ser arquivadas pelo cartão ou pela gaveta e consultadas em
  Arquivadas; “Último acesso” na Administração começa com maiúscula. O alerta sem fundo
  escuro e a borda visível das ações destrutivas já tinham sido corrigidos nesta etapa.

- **"Em dia" passou a falar de versão, não de tempo parado.** O card "Situação dos
  Clientes" do Resumo chamava de em dia quem teve qualquer atualização nos
  últimos 60 dias. Um cliente atendido ontem com a NFe velha aparecia em
  dia, e um sem visita há três meses, mas sem versão nova para receber,
  aparecia desatualizado. Agora há duas coisas separadas:
  - **Card "Atualização dos Clientes"**: Em dia, Desatualizados e Verificação
    pendente, pela versão recebida comparada com a oficial. **Quem tem
    B_Vendas é julgado só por ele**, que é o sistema que puxa os outros.
    Julgando por todos os sistemas, a produção mostrou só 21 de 369 em dia.
    Sem B_Vendas, precisam estar todos em dia. Cada total abre a lista exata
    dos clientes que ele contou, e o card mostra os sistemas com mais
    clientes atrasados. Quem só tem sistemas
    fixos (B_Atualizador, Suporte Bredas) fica fora da conta.
  - **Indicador "Sem Atualização Há Mais de N Dias"** (era "Parados"): mede
    só o tempo. O clique abria a aba Sistemas, que não mostrava esse
    conjunto; agora abre a lista.
  - **A mesma regra vale na aba Sistemas e na ficha.** Antes comparavam a
    versão como texto (`===`), e quem recebeu uma versão mais nova que a
    oficial aparecia como atrasado. Agora a comparação é por data.
  - **Atualização sem versão registrada é julgado pela data** do
    atualização contra a da oficial, e aparece como "(pela data)". Sem isso,
    348 de 369 clientes de produção ficariam "pendentes", porque os
    atualizações de antes da versão oficial não gravaram versão. A versão
    recebida continua "Não informada": nada é gravado retroativamente.
  - Migração 2: `sistemas.controla_versao`. Decisões em
    [ADR-0008](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0008).

- **Um nome só e um símbolo que acompanha o tema.** A barra lateral dizia
  "ATUALIZADOR / Gestor de clientes", o login "ATUALIZADOR" e a aba do
  navegador "Gestor de Atualizações". Três nomes para a mesma coisa, e
  "Atualizador" já é o nome do agente que roda no cliente. Agora é
  **Gestor de Atualizações** em todo lugar, com "Bredas Sistemas" como
  assinatura no login. Entre as duas propostas avaliadas (a outra era
  "Bredas Gestão"), ficou a que já estava na aba, no README e no serviço do
  Windows. Na barra o nome ocupa duas linhas, porque numa só era cortado
  pelos 238px de largura.
  - **O logo deixou de ser PNG.** O arquivo trazia o fundo escuro embutido
    na imagem: no tema claro virava um quadrado preto, e não acompanhava a
    cor de destaque escolhida nas Configurações. O símbolo (setas em ciclo
    + raio) foi redesenhado em SVG inline (`simboloMarca()` em
    `utils/icones.js`), com traço pensado para 16 px. O quadrado colorido em
    volta agora vem do CSS. Há também `favicon.svg`, e o `favicon.png` foi
    refeito a partir dele para as notificações.

- **O banco parou de guardar listas em texto e de ligar cliente pelo nome.**
  Os sistemas de uma atualização e de um cliente eram texto separado por
  vírgula ("B_Vendas, B_NFe"), com um JSON de versões por cima, e o cliente
  de uma atualização/agendamento era o nome dele. Toda tela reinterpretava
  esse texto com as mesmas regras de grafia, espalhadas em seis arquivos, e
  o catálogo não garantia nada: `B_NFCe` (100 usos), `B_Sped` (53), `CTe`,
  `B_Rat` e outros estavam no histórico sem existir na tabela de sistemas,
  e a situação do cliente chegava a listar `NFCe` e `B_NFCe` como dois
  sistemas. Agora há `atualizacao_sistemas` (um sistema por linha, com a
  versão recebida), `cliente_sistemas` e `cliente_id` de verdade.
  - **Sistemas que saíram do catálogo viram inativos**, e não somem do
    histórico: não aparecem nas telas de cadastro, e cadastrar o mesmo nome
    de novo reativa o sistema com o histórico junto. "Excluir" um sistema
    agora desativa em vez de apagar. As grafias de um mesmo sistema
    (`B_NFE`/`B_NFe`, `DFE`/`B_DFe`, `NFCe`/`B_NFCe`) viraram um só.
  - **Renomear um cliente** não precisa mais reescrever o nome em outras
    tabelas para não perder o histórico. Os 57 atualizações de clientes já
    excluídos ficam com o nome como estava, e passam a pertencer ao cliente
    se alguém cadastrá-lo de novo com esse nome.
  - O esquema passou a mudar por **migrações numeradas**, que rodam uma vez
    só, numa transação, com um backup do banco feito antes (aparece na tela
    de Backups). O `ALTER TABLE` a cada boot servia para acrescentar coluna,
    não para mover dado de uma coluna para uma tabela.
  - A API continua entregando os mesmos campos, montados por visões
    (`atualizacoes_v`, `clientes_v`), por isso o front-end não mudou. Um
    ensaio numa cópia do banco de produção comparou o código antigo com o
    novo: relatório por sistema, Resumo e última versão por sistema saíram
    iguais. A única mudança de resultado, além das grafias corrigidas, é que
    a quantidade de máquinas de um cliente com duas atualizações no MESMO
    dia agora vem sempre do último registrado; antes a escolha entre os dois
    era arbitrária.
  - Detalhes e o que ficou de fora de propósito (datas em texto,
    responsável em texto): [ADR-0007](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0007).

- **Sistemas ganhou uma "versão oficial" por sistema, e cada atualização
  guarda a versão que o cliente recebeu naquela data.** Antes a "versão"
  de uma atualização era um texto solto, sem ligação com o que estava
  publicado; agora, ao criar uma atualização, cada sistema informado recebe
  uma cópia (`versoes_sistemas`) da versão oficial cadastrada em Sistemas —
  mas só se ela já existia na data da atualização (uma versão publicada
  depois não é atribuída retroativamente). Editar depois (observações,
  datas) não reaplica versões novas; sistemas acrescentados na edição ficam
  sem versão, porque só um registro novo grava de fato a versão
  do dia. Desfazer uma exclusão preserva as versões que o registro já
  tinha, inclusive as legadas (registro com um único sistema, de antes
  dessa mudança). Histórico e importações antigos não recebem a versão
  oficial de volta — não haveria como saber qual era, na época.
  - A tela **Sistemas** ganhou "Em dia" / "Desatualizado" / "Nunca
    atualizado" / "Sem referência" (sem versão oficial cadastrada) / "Sem
    informação" (tem atualização, mas sem versão capturada), comparando a
    versão recebida com a oficial em vez de só comparar datas.
  - A ficha do cliente (**Consulta**) ganhou a mesma situação por sistema.
  - **Atualizações** ganhou "Relatório do período" (usa os filtros da tela:
    busca, responsável, datas) com totais por sistema e por responsável,
    prévia, cópia de texto e impressão/PDF — junto dos relatórios de
    atualização e de situação do cliente que já existiam. O Excel exportado
    passou a acrescentar resumo, filtros e cabeçalhos formatados numa aba
    além dos registros crus.
  - Ajustes de acabamento depois do primeiro uso: a tela Sistemas perdeu a
    coluna "Versão oficial" da grade (ela já aparecia sozinha, igual pra
    toda a lista, acima da tabela) e o aviso vermelho repetindo a mesma
    informação; o select de sistema parou de mostrar "— Sem referência"
    para quem ainda não tem data cadastrada; o botão "Salvar versão"
    ficou do tamanho do texto, e não mais esticado aos 200px mínimos do
    campo ao lado (herdava a largura por estar dentro de um `.field`); e o
    botão "Gerar Agendamentos em Lote" saiu dessa tela (a rota
    `/agendamentos/gerar-lote` continua existindo, só não tem mais gatilho
    aqui). A Matriz de Versões da ficha do cliente comparava a mesma versão
    resumida ("B_Vendas: 1; B_NFe: 2") contra TODAS as linhas de sistema, em
    vez da versão de cada um; e a grade de Atualizações cortava esse mesmo
    resumo no meio, porque a coluna é estreita demais para ele. As duas
    passaram a usar `versaoRegistrada()` para pegar a versão de um sistema
    específico — a matriz usa o sistema da própria linha, a grade usa o
    primeiro sistema listado na atualização (o resumo inteiro continua
    disponível no title, ao passar o mouse).
  - **A comparação por versão tinha quebrado a consulta "quem está
    desatualizado desde tal dia?"** que a tela Sistemas sempre ofereceu:
    depois que uma versão oficial existe, `relatorioPorSistema` ignorava
    por completo a data digitada e comparava só versão contra versão —
    e não dava mais pra explorar um corte de data arbitrário sem sobrescrever
    a referência oficial da equipe (que outras pessoas também usam). Agora
    o serviço distingue as duas perguntas: sem data digitada (ou com a
    mesma data já salva), continua comparando a versão recebida com a
    oficial; com uma data DIFERENTE da salva, vira uma consulta avulsa por
    data, do jeito simples de antes, sem tocar na referência. No front, o
    campo de data da tela Sistemas passou a recarregar a lista sozinho ao
    digitar (debounced), sem precisar clicar em "Salvar versão" pra ver o
    resultado de uma data só de teste.

- **Configurações virou uma tela, com a mesma cara do resto do app.** Era um
  modal de duas colunas com um desenho só dele (outra trilha de navegação,
  outro cabeçalho, outro rodapé), apertado em 880px com a tela desfocada
  atrás. Agora usa a moldura da Administração: abas sublinhadas, cabeçalho de
  seção e cartões com título. **Continua sendo aberta pelos mesmos lugares**
  (o botão no rodapé do menu lateral, o menu da conta, `Ctrl + ,` e a
  paleta) e não ganhou item no menu; o botão do rodapé fica aceso enquanto
  ela está aberta. São sete abas: Conta, Aparência, Tabelas, Navegação,
  Notificações, Acessibilidade e Atalhos.
  - **Conta de verdade:** o próprio nome se troca ali (antes só um
    administrador conseguia); a senha se troca num formulário no cartão,
    que avisa enquanto se digita se as duas não batem; e há a lista de
    **onde a conta está aberta** ("Chrome no Windows, entrou ontem"), com
    "Encerrar" em cada uma e "Encerrar as outras". A troca de senha já
    derrubava as outras sessões, mas não havia como ver quais eram. Rotas
    novas: `GET/PUT /api/usuarios/me` e `GET/DELETE /api/usuarios/me/sessoes`.
    A lista nunca devolve o identificador da sessão, só um resumo dele.
  - **Oito ajustes novos:** fonte (Inter ou a do Windows, que aparece na hora
    mesmo sem internet), largura do conteúdo (tela inteira para monitor
    largo), anel de foco reforçado, esconder as dicas de atalho, período com
    que Atualizações já abre filtrada, confirmar ou não ao sair, quanto tempo
    os avisos ficam na tela e o contador de pendências no título da aba. Os
    perfis Operação e Alto contraste passaram a usar alguns deles.
  - **Prévia ao vivo** na aba Tabelas: uma tabela de exemplo com as classes da
    tabela de verdade, então densidade, zebra e tamanho do texto aparecem nela
    como vão aparecer nas telas.
  - **Liga/desliga** no lugar dos trilhos "Sim / Não" e "Lembrar / Sempre
    limpo".
  - **Busca** que responde com uma lista de ajustes; escolher um leva à aba
    certa, acende a linha e põe o foco no controle. A paleta (`Ctrl + K`)
    ganhou um atalho para cada aba.
  - **Atalhos de teclado** listados na própria tela, sem abrir outro modal.
  - A moldura das abas saiu da Administração para
    `components/TelaComAbas.js`, e as duas telas usam a mesma.

- **Agendamentos: prioridade, sistema e observação.** Cada tarefa ganhou
  prioridade (Baixa, Normal, Alta, Urgente), o sistema a atualizar e um campo
  de observação. Feito com o Gemini.
  - No quadro, Urgente e Alta ganham selo e borda colorida, a observação
    aparece em até duas linhas no cartão, e o cabeçalho de cada coluna conta
    as vencidas (ou, sem vencidas, as urgentes e altas).
  - Dentro de cada coluna as mais urgentes vêm primeiro, e há filtro por
    prioridade.
  - Tarefas que já existiam ficam como "Normal" e sem sistema. A geração em
    lote grava o sistema do lote em cada tarefa.
  - O cartão "Tempo Médio de Resolução de Tarefas" saiu do Resumo.

- **Administração virou uma tela própria, só de administrador.** Tudo o que é
  da equipe inteira saiu do painel de preferências pessoais, onde era uma
  seção "Segurança" feita só de links para cinco modais, cada um com desenho
  próprio. Agora é uma tela com abas: Usuários, Histórico, Regras da equipe,
  Notificações, Atualizador, Backups e Saúde do servidor.
  - **O Histórico mudou de lugar** e passou a ser só de administrador. Operador
    e Consulta deixam de vê-lo.
  - **As regras da equipe foram para o banco** e valem na hora, sem reiniciar
    (`server/src/config/regrasEquipe.js`). Duas delas nem eram ajustáveis: os
    60 dias de "desatualizado" e as 10 cópias de backup estavam fixos no código.
    O dia de arquivar tarefa tinha três padrões diferentes (30 no código, 7 no
    exemplo, o valor de cada `.env`). Na primeira subida, o que estava no
    `.env` é trazido para o banco uma vez só.
  - **A tela não escreve mais no `.env`.** A antiga "Configuração da API"
    reescrevia o arquivo, pedia para reiniciar e mandava a chave dos agentes
    inteira para o navegador. A chave continua no `.env`; a tela só mostra se
    ela existe e como termina. No Docker, o `.env` passa a ser montado só
    para leitura.
  - **Discord:** botão de mensagem de teste, e o webhook só aceita endereço do
    Discord (o servidor faz POST nele). Configurar o webhook com o servidor no
    ar agora liga o alerta de agentes sem reiniciar.
  - **Configurações pessoais:** "Sistema" virou "Conta", com a troca da
    própria senha (antes escondida em "Usuários e Permissões"). Com o
    Atualizador desligado, somem os ajustes que só serviam a ele.
  - **Acabamento corrigido:** ícone de 200px e títulos quebrados na Saúde,
    campos sem espaço na Configuração da API, botão-link sublinhado nos backups.

- **Rebaixar ou excluir um usuário agora derruba as sessões dele.** O papel
  que as rotas conferem é o copiado para a sessão no login. Sem isso, um
  admin rebaixado continuava admin por até 7 dias, e podia inclusive religar
  o Atualizador. Trocar só o nome não desloga ninguém.
- **O servidor se recusa a subir sem `SESSION_SECRET`, ou com o valor de
  exemplo do `.env.example`.** Esse valor é público, e com ele qualquer um
  forja um cookie de admin. O caso mais comum era silencioso: no Docker, sem
  o `server/.env`, o servidor subia com o segredo de exemplo. Agora o
  container não sobe, e o motivo aparece em `docker compose logs`.
- **Tag `html` para montar HTML (`utils/html.js`).** Ela escapa todo valor
  interpolado. O que antes dependia de lembrar do `escaparHtml` em cada
  interpolação passa a ser o padrão. O próprio `escaparHtml` não escapava
  aspas, e o `aria-label` do cartão do kanban quebrava com uma tarefa que
  tivesse `"` no título.
  - Já foram migrados: Agendamentos, Atualizações, Clientes, Consultar
    Cliente, Resumo, o sino e a paleta Ctrl+K.
  - O resto está listado em `client/tests/html-seguro.test.mjs`, uma trava
    em que a contagem de cada arquivo só pode cair.
  - A marcação e a regra dessas telas saíram das views para `templates/` e
    `domain/`, onde são testadas no Node (`client/tests/telas.test.mjs`).

- **Colunas da tabela de Atualizações cortando texto, e "Obs" ocupando um
  quarto da tela.** Duas causas, achadas comparando a tela renderizada
  contra uma cópia isolada da mesma tabela (mesmo CSS, mesmo componente,
  fora do app) num Chrome headless: `LARGURAS_ATUALIZACAO` reservava só
  58px para "Máquinas" -- não cabe nem o rótulo do cabeçalho, que vazava
  visualmente pra dentro da coluna "Obs" ao lado -- e só 86px para "Ações",
  8px a menos do que os próprios 3 botões (26px cada) mais o padding da
  célula já ocupam sozinhos, empurrando o terceiro ícone para debaixo da
  barra de rolagem. "Obs", em compensação, tinha 22% da tabela (a fatia
  individual mais larga depois de "Cliente") para mostrar, normalmente,
  uma frase curta. Larguras redistribuídas (`AtualizacoesView.js`) sem
  abrir mão de "nenhum rolamento horizontal" -- testado até 1300px de
  largura de tabela, congestionado de propósito, sem nenhuma coluna
  sobrepondo a vizinha.

  A causa-raiz por trás do cabeçalho "vazando" era mais geral, e por isso a
  correção foi no componente, não só nesta tela: o cabeçalho ordenável
  (`TabelaOrdenavel`) é um `<button>` `display:flex`, e um item flex não
  encolhe abaixo do tamanho do próprio conteúdo por padrão -- sem
  `min-width: 0` no botão e sem o rótulo estar num `<span>` próprio com
  `text-overflow: ellipsis`, um texto comprido numa coluna estreita
  simplesmente ultrapassava a largura da célula em vez de truncar. Vale
  para qualquer tabela que use `TabelaOrdenavel`, não só Atualizações.

- **O selo vermelho do indicador "Parados" no Resumo mostrava um pedaço de
  cor destacado atrás do ícone.** `.stat-tile__icon` é uma caixa quadrada de
  16x16 sem `border-radius`; o ícone `alerta` é um triângulo, que não
  preenche os quatro cantos do quadrado. Enquanto o fundo ficava
  `transparent` (estado normal) isso não aparecia -- só quando o indicador
  vira alerta (`.is-alert`, fundo `--cor-vermelho-fraco`) as quinas do
  quadrado expostas ao redor do triângulo pareciam uma mancha de cor errada.
  Corrigido com o mesmo raio que `.stat-tile__delta`, no mesmo arquivo, já
  usa para o mesmo tipo de selo colorido.

- **O painel passou a ter imagem Docker** (`Dockerfile`, `.dockerignore`,
  `docker-compose.yml`). Não substitui o serviço do Windows via NSSM: é a
  opção para quando o app vai para uma máquina Linux, ou para isolá-lo do
  resto do que roda no PC. Quatro coisas tiveram que ser resolvidas, e todas
  as quatro falhariam **em silêncio** se tivessem sido ignoradas:

  - **Fuso.** O container roda em UTC por padrão, e `AgendamentoRepository.venceEmBreve`
    monta "hoje" com `getFullYear/getMonth/getDate` — relógio **local**. Das
    21h à meia-noite, horário de Brasília, o servidor já estaria no dia
    seguinte e os agendamentos de amanhã apareceriam como atrasados no sino
    de notificações. Daí o `TZ=America/Sao_Paulo` fixado na imagem.
  - **O `.env` tem que ser gravável.** A tela *Configurações → Sistema →
    "Configuração da API"* escreve no arquivo (`ConfiguracaoApiService`), o
    que descarta passar tudo por `environment:` no compose. Pior: o `dotenv`
    não sobrescreve variável que já veio do ambiente, então qualquer variável
    declarada no compose venceria o `.env` e faria aquela tela salvar sem
    efeito nenhum, sem erro. Só `PORT` ficou no compose — não é editável por
    lá, e fixá-la é o que mantém o mapeamento de portas sempre válido.
  - **Dados em volume nomeado, não em pasta do Windows.** O SQLite em modo
    WAL depende de travas de arquivo que não funcionam de forma confiável
    através da tradução de sistema de arquivos do Docker Desktop. O caminho
    para tirar cópia para fora continua sendo o download de backup do próprio
    painel.
  - **Base Debian, e contexto de build em `web/`.** `better-sqlite3` é módulo
    nativo: em glibc baixa binário pronto, em Alpine (musl) compilaria do
    zero a cada build. E `server/package.json` depende de `file:..`, o pacote
    da raiz — construir a partir de `web/server/` quebra o `npm ci` antes de
    começar. É também por isso que os caminhos são `/app` e `/app/server` nos
    dois estágios: o vínculo `file:..` é um link simbólico relativo, e só
    continua apontando para o lugar certo se a estrutura de pastas for
    idêntica na imagem final.

  A verificação de saúde bate em `/api/auth/status` — rota pública que
  responde do banco —, e não numa rota que só provaria que o processo está
  de pé. É feita com `node -e` em vez de `curl` porque a imagem slim não tem
  curl, e instalar um só para isso seria uma camada a mais à toa.

  Testado de ponta a ponta (build, subida, healthcheck, importação do
  `gestao.db` real) num Docker Desktop de verdade, e a receita de "trazer um
  banco que já existe" do README mudou por causa disso: `docker compose cp`
  recusa copiar para um container parado ("no container found for
  service"), e qualquer cópia para dentro do container chega dona de
  `root` -- sem corrigir isso o servidor sobe e cai na hora com
  `SqliteError: attempt to write a readonly database` (o processo roda como
  `node`, uid 1000). A receita final usa `docker cp` simples (funciona
  parado) seguido de `docker run --volumes-from` para o `chown` -- essa
  última parte evita depender do nome do volume nomeado, que o Docker deriva
  do nome da pasta do projeto e muda se ela for renomeada.

  O Docker Scout apontou 70 vulnerabilidades na imagem (3 críticas), e as
  duas mais graves com correção disponível -- CVE em `tar` e em
  `brace-expansion`, severidade 9.2 e 8.7 -- não vinham de dependência
  nenhuma do projeto: são internas ao próprio CLI do npm, que a imagem base
  carrega em `/usr/local/lib/node_modules/npm/`. Como o CMD final roda
  `node server.js` direto e nada em tempo de execução chama `npm`/`npx`
  (só o build, no `RUN npm ci` do primeiro estágio, usa), o runtime final
  apaga os dois (`npm`, `corepack`) com um `rm -rf`. Resultado: as críticas
  fixáveis foram para zero, e o total caiu de 70 para ~47 -- o que sobra é
  todo pacote de sistema (perl, util-linux, zlib) ainda sem correção
  publicada pela Debian, fora do nosso controle.

- **As notificações viraram um sino no cabeçalho.** Havia duas coisas grandes
  dizendo pedaços do mesmo assunto ("o que está pendente agora"): a faixa
  amarela de lembretes, que ficava entre o cabeçalho e o conteúdo de **toda**
  aba, e o bloco "Precisa de Atenção", que abria o Resumo com uma grade de
  cards de 220px. Somadas, custavam a primeira dobra da tela inicial para
  informação que cabe num número de dois dígitos. As duas saíram e viraram um
  sino ao lado do nome de usuário (`components/MenuNotificacoes.js`), com
  contador e um painel que lista agendamentos atrasados, agendamentos de hoje
  e agentes com falha, com pendências, esperando autorização há tempo demais
  ou sem contato. Cada linha leva à tela do assunto **já filtrada** — o bloco
  antigo tinha o `data-filter` no HTML mas o descartava no clique, entregando
  a lista inteira de Distribuição para quem tinha clicado em "1 agente com
  falha". O que se perde é o "não dá para não ver"; o que compensa é o `(2)`
  no título da aba do navegador, que passou a contar tudo isso e é o único
  canal que alcança quem está com o Gestor atrás do ERP. "Marcar como vistas"
  apaga o contador e não a lista, pela mesma regra de antes (vale até o dia
  seguinte ou até uma sessão nova).

- **O card "Agendamento atrasado" do Resumo nunca apareceu.** `ResumoView` lia
  `lembretes.atrasados`, mas `/agendamentos/lembretes` devolve um **array**
  puro (ver `AgendamentoRepository.venceEmBreve`). `undefined || []` virava lista
  vazia, o card não era montado, e nada disso produzia erro no console: um
  aviso que não avisava, desde que foi escrito. A contagem saiu da tela e foi
  para `domain/notificacoes.js`, que não toca no DOM e por isso tem teste —
  que é o que impede a próxima versão do mesmo silêncio.

- **Botões de ação por linha (Atualizações, Clientes, Agendamentos) trocaram
  emoji colorido por ícone SVG monocromático.** Os botões usavam glifos de
  emoji (📋 👤 ✏️ 🔑 🔍) como conteúdo do `<button>`; cada sistema operacional
  renderiza emoji com sua própria fonte colorida, destoando do resto da
  interface, que usa só os ícones de linha de `utils/icones.js`
  (`stroke="currentColor"`). Trocado por `iconeSvg()`, acrescentando os ícones
  `editar`, `chave` e `converter` ao conjunto existente.

- **Atualização automática da Distribuição concentrada em Configurações.** A
  tela deixou de repetir estado, liga/desliga e contagem regressiva; também
  removeu a barra de progresso contínua. A atualização manual permanece como
  um botão compacto, somente com ícone e rótulo acessível.

- **Roadmap UX/UI entregue em quatro frentes.** Atualizações e Agendamentos
  passaram a usar gavetas laterais, ações rápidas por linha, presets de data,
  atalhos `j/k/e/x/c` e busca por `/`; Agendamentos ganhou visão Kanban e
  Sistemas gera tarefas em lote. A consulta virou Ficha 360° com cadastro,
  acessos, matriz de versões e linha do tempo. Distribuição ganhou live pulse
  opcional, e o catálogo passou a aceitar piloto por código de cliente, promoção
  e rollback transacional. A escolha do grupo ganhou busca por código/nome e
  seleção visual por chips. A auditoria guarda snapshots para exibir Antes × Depois, e
  Agendamentos usa revisão otimista para impedir sobrescrita silenciosa.

- **`*/` dentro de um comentário derrubou o CSS inteiro.** Numa correção de
  comentário em `components.css`, o texto `client/js/**` seguido de `/*.js`
  formou um `*/` — que **fecha o comentário de cabeçalho ali**. Da quinta linha
  em diante, a prosa em português virava CSS inválido e o navegador descartava
  o começo da folha: a página carregava inteira, sem estilo nenhum.
  O defeito passou por status HTTP 200, `Content-Type: text/css`, tamanho certo
  e console limpo — CSS falha em silêncio por desenho. Corrigido, e coberto por
  `client/tests/css.test.mjs`, que confere comentário aberto, chaves
  balanceadas, primeira regra válida e prosa acentuada fora de comentário.

- **Dois backups no mesmo segundo viravam um só.** O nome do arquivo de
  backup usa carimbo com resolução de segundos (`gestao_AAAAMMDD_HHMMSS.db`) e
  a cópia é um `fs.copyFileSync`, que sobrescreve sem avisar. O caminho
  perigoso é a restauração: ela faz uma cópia de segurança do estado atual
  imediatamente antes de sobrescrever o banco, e essa cópia podia cair no mesmo
  segundo de um backup já existente — **apagando-o em silêncio**. Perder um
  backup assim só se descobre no dia em que ele faz falta. Corrigido
  acrescentando um sufixo (`_2`, `_3`) apenas quando há colisão, de modo que o
  nome de sempre continua o mesmo no caso normal; o rótulo na tela mostra
  "18/09/2026 13:16:25 (2)".

- **O painel de Saúde reportava "0 pacotes, 0 bytes" — sempre.**
  `SaudeService` lia `this.versoes.pastaDosPacotes`, propriedade que `VersaoService`
  **nunca teve**. Como `fs.existsSync(undefined)` devolve `false` em vez de
  lançar, a métrica ficava zerada em silêncio, sem nada no log. O teste que
  existia não pegava: o dublê de `versoes` declarava `pastaDosPacotes`, ou seja, o
  teste afirmava uma interface que o objeto real não implementava — e ninguém
  desconfiaria olhando a tela, porque zero é um número plausível demais.
  Corrigido com um getter `pastaDosPacotes` de verdade (que `_caminhoPacote` passou
  a reaproveitar), mais um teste que faz a asserção contra a **classe real**, e
  não contra o dublê. Encontrado por verificação estática de tipos.

- **Verificação estática de tipos, sem etapa de build.** `npm run check` roda o
  TypeScript em modo `checkJs`/`noEmit` sobre o código puro dos dois lados
  (`client/js/domain`, `client/js/utils`, `server/src/shared`,
  `services/normalizacao.js`), conferindo o JSDoc que já existia. Nada é
  compilado e o navegador continua executando exatamente o que está em
  `client/`. Também no CI. Ver
  [ADR-0006](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0006) — inclusive por
  que o resto do front-end fica de fora.

- **`?sortBy=constructor` derrubava qualquer listagem paginada.**
  `shared/sortHelper.js` lia a coluna pedida com `sortMap[sortBy]`, e o acesso
  por índice a um objeto literal também alcança o que ele **herda** de `Object`
  — `constructor`, `toString`, `valueOf`, `hasOwnProperty`, `__proto__`. Todos
  devolvem valor "truthy", passavam pela checagem `if (!expr)` e eram
  interpolados no SQL, gerando
  `ORDER BY function Object() { [native code] } ASC`. Não era injeção (nada que
  o atacante escreve chega ao SQL), mas era SQL inválido: qualquer pessoa
  logada derrubava com 500 toda listagem paginada mudando um parâmetro na barra
  de endereço. Corrigido com `Object.hasOwn` mais checagem de tipo. Encontrado
  ao escrever o primeiro teste dessa função — ela nunca tinha sido testada.

- **Um caminho de asset inexistente respondia 200 com o `index.html`.** O
  fallback de SPA capturava qualquer caminho fora de `/api`, então um arquivo
  movido de pasta devolvia HTML no lugar do módulo, e o navegador só reclamava
  depois com "expected a JavaScript module script but the server responded with
  a MIME type of text/html" — mensagem que manda procurar no lugar errado.
  Agora um pedido com extensão de arquivo que não existe dá 404 de verdade
  (`middlewares/rotaNaoEncontrada.js`), e rota de API inexistente responde JSON,
  não HTML. Encontrado durante a reorganização de pastas do `client/`.

- **`client/package.json` e `client/tests/` eram servidos publicamente** pelo
  `express.static`. Não havia segredo neles, mas entregavam de graça um mapa
  dos módulos internos. Bloqueados antes do estático.

- **Reorganização do `client/js/`**: a pasta `core/`, com 35 arquivos
  misturando cinco categorias, virou `app/`, `components/` (+ `charts/`),
  `domain/` e `utils/`, cada uma com um critério verificável. 175 caminhos de
  importação reescritos. Ver
  [ADR-0005](docs/DOCUMENTACAO_CONSOLIDADA.md#adr-0005).

- **Testes**: de 28 para 458 no painel (359 no servidor, 99 no front-end). Passaram a ter cobertura o
  roteamento HTTP (ordem de API × estático × fallback), o grafo de módulos do
  front-end, os helpers de `shared/` e a normalização de sistemas/responsáveis.

- **Documentação**: este histórico saiu do README (que tinha 641 linhas);
  criados `CONTRIBUTING.md`, `SECURITY.md`, `docs/adr/` com 5 decisões
  registradas, e um README na raiz do espaço de trabalho cobrindo painel +
  agente. CI próprio (`.github/workflows/ci.yml`), que antes não existia.

- **Alerta proativo de agente offline/com erro** (`AlertaAgenteService`):
  com `DISCORD_WEBHOOK_URL` configurada, o app confere sozinho a cada
  `ALERTA_AGENTES_INTERVALO_MINUTOS` (padrão 15) a situação de cada agente
  do Atualizador automático (mesmo cálculo do painel da aba Distribuição)
  e avisa o canal só na *transição* para "offline" (sem contato há 24h+)
  ou "erro" — não repete o aviso a cada ciclo enquanto o problema
  continua, e avisa de novo quando o agente volta a se comunicar. Antes,
  só quem abrisse a tela do painel saberia que um cliente parou de
  atualizar.
- **Tendência mensal de atualizações** (Resumo): gráfico com os últimos 12
  meses, para ver se o volume de atualizações está subindo ou caindo ao
  longo do tempo — antes só existia o total do mês atual.
- **Grupo/rede de clientes**: novo campo opcional "Grupo/Rede" no
  cadastro de Clientes (com autocompletar dos grupos já usados), pra
  clientes com várias unidades sob a mesma bandeira (ex.: sete lojas de
  uma mesma rede) poderem ser encontrados/agrupados por busca. Não muda
  nada em quem não usa o campo.
- **Converter Agendamento em Atualização**: botão "Converter em
  Atualização" na tarefa selecionada da aba Agendamentos — leva pra
  Atualizações com cliente, responsável, data e um registro novo (não
  edita nada) já pré-preenchidos a partir da tarefa, em vez de digitar
  tudo de novo.
- **Tempo médio de resolução por responsável** (Resumo): quantos dias, em
  média, uma tarefa de Agendamentos leva entre ser criada e ser marcada
  "Concluído", por responsável. Só entra no cálculo tarefa criada
  *depois* desta métrica existir — tarefas antigas não têm como saber
  quando foram criadas de verdade, e contar uma data inventada seria pior
  que não mostrar nada.

### 10/09/2026

- **Acessos remotos por cliente** (aba Clientes, botão **Acessos** no
  topo, ao lado de "Novo Cliente"): cadastro de AnyDesk/Suporte Bredas de
  cada máquina de um cliente (servidor, estações, etc.), com botão de
  copiar ao lado de cada ID. Tabela nova (`cliente_acessos`), apagada
  automaticamente junto com o cliente se ele for excluído.
- **Ações em lote em Agendamentos e Clientes** (mesmo padrão que já
  existia em Atualizações — segurar `Shift` e clicar em duas linhas
  seleciona tudo entre elas): em Agendamentos dá para concluir ou excluir
  várias tarefas de uma vez (com "Desfazer"); em Clientes dá para marcar
  um sistema em vários de uma vez ou excluir vários (sem "Desfazer" aqui
  — ver comentário em `ClienteService.excluirVarios`, a exclusão em lote de
  cliente também apaga os acessos remotos cadastrados neles).
- **Changelog em itens na Distribuição**: o campo "Observações" ao
  preparar uma versão virou uma lista de itens (adicionar/remover linha),
  em vez de um texto livre só — a aba Versões mostra como lista com
  marcadores.
- **Histórico recente na Consulta**: a ficha de um cliente mostra as
  últimas 5 atualizações dele, não só a mais recente.
- **Verificação de integridade dos backups**: cada backup automático
  roda um `PRAGMA integrity_check` do SQLite assim que é criado; se
  falhar, aparece um aviso "Corrompido" na tela de Backups e um erro no
  log do serviço — antes, um backup corrompido só seria descoberto na
  hora de precisar restaurar de verdade.
- **Trocar a própria senha e "último login"**: qualquer pessoa logada
  pode trocar a própria senha pela tela de Usuários (pede a senha atual);
  a mesma tela mostra quando cada conta acessou pela última vez. Para
  quando ninguém mais consegue entrar, ver "Recuperando acesso" abaixo.
- **Correção de um bug de CSS que afetava várias telas**: qualquer
  elemento escondido com o atributo `hidden` cuja classe definisse
  `display` (a maioria dos botões, barras de ferramentas, formulários
  recolhíveis) na verdade continuava aparecendo — "Limpar busca"
  aparecia mesmo sem busca nenhuma, a barra de progresso de upload
  aparecia parada em "0%" sem upload nenhum, os formulários "Convidar
  Pessoa"/"Trocar minha senha" apareciam sempre abertos. Corrigido com
  uma regra CSS única e global, em vez de remendo por componente.

### 11/09/2026

- **Relatório de atualização** (aba Atualizações, botão **Gerar
  Relatório** ao lado de "Atualizar Selecionado"): monta o texto do que
  foi feito, pronto para copiar num chamado. Dois formatos no mesmo
  modal — **Esta atualização** (o registro selecionado, com a versão
  anterior do cliente entre parênteses) e **Histórico do cliente**
  (todas as atualizações daquele cliente, da mais recente para a mais
  antiga). O botão "Copiar" leva o texto para a área de transferência e
  fecha; se o navegador não deixar copiar (HTTP puro, ver
  `copiarParaAreaDeTransferencia` em `client/js/utils/html.js`), o modal fica aberto
  com o texto selecionado em vez de sumir com ele.

  Não exigiu campo novo nenhum: o relatório usa só o que já está gravado
  em `atualizacoes` e `clientes`, então os registros antigos vindos de
  planilha geram relatório igual aos de hoje. Campo vazio não vira linha
  — quase metade do histórico não tem responsável preenchido, e uma
  página de "Por: —" seria pior que um texto mais curto. A única
  mudança no backend foi aceitar `limit=todas` em
  `/atualizacoes/recent-by-client/:nome`, que antes travava em 50: o
  relatório do cliente existe justamente para mostrar tudo.

- **Padronização de sistemas e responsáveis**: o campo "Sistema" das
  atualizações era texto livre e tinha acumulado 144 grafias para 14
  sistemas (`B_NFE`, `B_vendas`, `B_areadocontador e B_importaXML`). Não
  era só feio: o relatório da aba Sistemas compara texto exato, então 60
  dos 370 clientes de B_NFe apareciam como "Nunca atualizado" só porque
  alguém tinha digitado `B_NFE`. Agora toda gravação — cadastro, edição e
  **importação de planilha** — passa por `services/normalizacao.js`, que
  casa o nome com o catálogo ignorando caixa, acento e pontuação. O campo
  Responsável segue a mesma ideia, sem lista fixa de pessoas: canoniza
  contra as grafias que já existem. O histórico antigo foi acertado de uma
  vez por `scripts/normalizar-historico.js`, com as mesmas funções.

- **Arquivar agendamentos concluídos** (aba Agendamentos): tarefa
  concluída há mais de 30 dias sai da lista sozinha — a varredura roda
  junto da listagem, sem agendador. Ela **não é apagada**: está no filtro
  de Status em "Arquivadas" (com a contagem no rótulo), continua contando
  no tempo médio de resolução por responsável do Resumo, e o botão
  "Reabrir" traz de volta como "A Fazer". Desarquivar reabre de propósito:
  como a varredura roda a cada listagem, uma tarefa que apenas saísse do
  arquivo continuando "Concluído" sumiria de novo no mesmo instante. O
  prazo está em `AGENDAMENTO_ARQUIVAR_DIAS` no `.env` — é regra da equipe
  inteira, não uma preferência de cada pessoa: o conteúdo da lista precisa
  ser o mesmo para todo mundo. Quem não quer esperar o prazo tem o botão
  "Arquivar" (ao lado de "Excluir Selecionada"), restrito a tarefas já
  "Concluído".

- **Configurações passam a ser da conta, não do navegador**: tema, cor de
  destaque, tamanho do texto, densidade, linhas por página, tela inicial e
  as demais opções do painel agora ficam no servidor
  (`usuario_preferencias`, via `GET`/`PUT /api/preferencias`), uma linha
  por conta. Antes viviam só no localStorage, e o efeito aparecia na hora
  errada: trocar de máquina, usar o Edge em vez do Chrome ou limpar os
  dados do site devolvia o app aos padrões — e num computador
  compartilhado as escolhas de uma pessoa recebiam a seguinte.

  O localStorage **continua sendo escrito**, agora como cache, e isso não é
  redundância: `theme-init.js` roda no `<head>`, antes do primeiro pixel, e
  precisa de uma resposta síncrona. Esperar uma requisição ali faria a
  página nascer no tema errado e trocar na cara de quem está olhando. O
  cache pinta na hora; as preferências da conta chegam alguns
  milissegundos depois e corrigem se divergirem. Quem entra numa conta
  diferente no mesmo navegador tem o cache limpo antes, para não herdar o
  tema de quem usou por último.

  Migração é invisível: na primeira vez que uma conta entra sem nada salvo
  no servidor, o que estava no localStorage daquele navegador vira as
  preferências dela. A única opção que **não** acompanha a conta é o aviso
  de falhas por notificação — depende da permissão que o navegador concede
  por aparelho, e sincronizá-la faria o painel dizer "ativado" numa máquina
  onde a permissão nunca foi pedida.

### 15/09/2026 — interface, acessibilidade e Configurações

- **Cabeçalho que acompanha a rolagem, busca visível e menu da conta.** O
  cabeçalho agora fica grudado no topo (com sombra e um respiro menor
  assim que sai do topo): numa tabela de duzentas linhas, rolar até o fim
  deixava a pessoa sem o nome da tela e sem nenhum botão, e a saída era
  rolar tudo de volta. Ao lado dele entrou um campo-botão **"Buscar…"**
  com o `Ctrl + K` escrito — o atalho existia desde a primeira versão e
  não aparecia em lugar nenhum da tela, e atalho que não aparece é atalho
  que só quem escreveu o código usa (o CSS dele já estava escrito há
  tempos; faltava o botão). No canto, o bloco de texto com o nome de quem
  está logado e os dois ícones sem rótulo (engrenagem e porta) viraram um
  alvo só: o avatar abre um menu com tema (três opções escritas por
  extenso), "Atualizar os dados desta tela", Configurações, Atalhos e
  Sair — este último em vermelho e separado por uma divisória, longe do
  que se clica sem pensar.

- **Atualizar os dados sem recarregar a página.** O cache que torna a
  troca de aba instantânea não tinha como ser dispensado: quando outra
  pessoa mexia no mesmo registro do outro lado da sala, só o F5 resolvia —
  e o F5 cobra o login, a rolagem e a aba aberta. Agora existe "Atualizar
  os dados desta tela", no menu da conta e na paleta de comandos.

- **Perfis de aparência** (Configurações > Aparência): **Equilibrado**,
  **Operação**, **Leitura** e **Alto contraste**, cada um com uma amostra
  desenhada em CSS. O painel tem dezoito ajustes, e quase ninguém quer
  decidir dezoito coisas — quer dizer "preciso caber mais linha na tela"
  e voltar ao trabalho. Um perfil leva ao padrão tudo que ele não
  menciona, de propósito: aplicado por cima de um tamanho de texto que
  sobrou de outro dia, entregaria uma tela que não é nem o perfil nem o
  que havia antes.

- **Dá para ver o que você mudou.** Cada ajuste fora do padrão ganha o
  selo "alterado" e um fio na borda; cada seção mostra quantos tem; o
  rodapé resume ("3 ajustes fora do padrão"). A pergunta "o que aqui
  dentro fui eu que mexi?" era impossível de responder sem lembrar de
  cada escolha feita meses atrás — e é a primeira pergunta de quem herda
  uma máquina configurada por outra pessoa. Junto veio **"Restaurar esta
  seção"** (o botão de restaurar era tudo ou nada, e "tudo" é caro demais
  para quem só quer desfazer a densidade) e o fim do `location.reload()`
  que o "Restaurar padrões" dava: o painel continua aberto, sem piscar a
  página inteira.

- **Exportar e importar preferências** (Configurações > Sistema): um
  arquivo `.json` com as dezesseis preferências, para deixar a máquina
  nova — ou a do colega — igual à sua sem refazer as escolhas na mão. A
  importação ignora em silêncio o que não reconhece (chave de uma versão
  mais nova, valor editado à mão) e diz quantas ficaram de fora, em vez
  de recusar o arquivo inteiro.

- **Seção nova: Acessibilidade.** **Contraste alto** reforça bordas e
  textos de apoio *por cima* do tema escolhido — quem precisa enxergar
  melhor não devia ter que abrir mão do tema que prefere; ele é escrito
  uma vez só no CSS, derivando as cores do próprio tema com `color-mix`,
  em vez de um bloco para escuro e outro para claro. **Superfícies:
  sólidas** desliga o vidro fosco (`backdrop-filter`), que é o efeito mais
  caro da tela e é recalculado a cada quadro do que passa por trás dele —
  ou seja, exatamente enquanto se rola uma tabela longa, numa máquina de
  escritório sem placa de vídeo dedicada. **Animações** veio de Aparência,
  onde estava sozinha.

- **Linhas alternadas (zebra) das tabelas viraram opção.** A faixa ajuda
  a não pular de linha numa tabela larga e atrapalha quando a linha já é
  tingida por outro motivo (o vermelho de "parado há muito tempo", em
  Resumo e Sistemas), porque as duas tintas se somam.

- **`Ctrl + ,` abre as Configurações** — o mesmo atalho do Windows, do
  macOS e do VS Code. Um atalho que a pessoa já traz aprendido de outro
  lugar é o único tipo que não precisa ser ensinado. Está na lista do
  `?` e ao lado do item no menu da conta.

- **Tela de login: mostrar a senha e aviso de Caps Lock.** A senha é
  digitada às cegas, e o erro mais comum não é esquecê-la, é digitá-la
  errado duas vezes seguidas sem nunca ver o que saiu. O Caps Lock ligado
  é a causa silenciosa de metade dos "minha senha parou de funcionar": a
  tecla que estragou a senha fica acesa num canto do teclado que ninguém
  olha.

- **Aviso de servidor fora do ar, com reconexão sozinha.** O servidor é um
  serviço do Windows numa máquina da rede, e ele reinicia (atualização do
  Gestor, reboot, queda do switch). Até agora isso era invisível para quem
  estava com o app aberto: a tela seguia mostrando os dados de antes — o
  que é o certo, dado velho é melhor que tela em branco —, mas nada dizia
  que eles tinham parado no tempo, e a descoberta vinha pelo pior caminho,
  clicando em "Adicionar" e recebendo um erro que não esclarecia se o
  problema era daquele registro ou de tudo. Agora uma faixa no topo avisa
  enquanto durar, tenta de novo a cada cinco segundos (e tem "Tentar
  agora"), some sozinha quando o servidor volta e, ao voltar, busca de novo
  os dados da tela aberta — enquanto ele esteve fora, outra pessoa pode ter
  mudado alguma coisa.

- **Densidade e contraste na paleta de comandos** (`Ctrl + K`): são os dois
  ajustes que se liga e desliga várias vezes por dia — a densidade quando a
  tabela da vez é longa, o contraste quando o sol bate na tela à tarde. Os
  outros dezesseis continuam só em Configurações, que é onde devem ficar:
  são decisões que se toma uma vez.

- **`Ctrl + B` recolhe e abre o menu lateral**, e cada aba mostra o próprio
  `Alt+N` ao passar o mouse. Recolher o menu é a única preferência que se
  quer mexer várias vezes no mesmo dia (mais coluna visível numa tabela
  larga, menu de volta para trocar de tela), e custava quatro cliques; o
  atalho numérico existia desde sempre e só aparecia no `title`, que só
  conta a mesma coisa depois de um segundo parado em cima — e ninguém para
  em cima de um menu que já sabe usar.

- **Aviso com "Desfazer" não encurta mais quando o mouse passa por cima.**
  Ele vive mais tempo que um aviso comum de propósito; passar o mouse (e
  sair) reagendava a saída com a duração padrão, ou seja, o gesto de ir até
  o botão era justamente o que tirava tempo de usá-lo. O aviso agora também
  para o relógio quando recebe foco pelo teclado — sem isso ele podia sumir
  com o foco dentro dele, no meio da ação que a pessoa ia desfazer.

- **Lembretes no título da aba do navegador** (`(2) Clientes · Gestor de
  Atualizações`). O Gestor passa boa parte do dia numa aba de fundo, atrás
  do ERP: a faixa de lembretes só alcança quem está olhando a tela, e quem
  está olhando é justamente quem menos precisa ser lembrado. O número no
  título é a única parte do app que aparece na barra de tarefas do Windows.

- **A faixa de "sem conexão" também escuta o navegador.** O `offline` do
  próprio navegador chega na hora em que o cabo sai ou o Wi-Fi cai, sem
  esperar nenhuma requisição falhar. O caminho de volta continua sendo um
  só: quem apaga a faixa é a resposta do servidor, não o palpite do
  navegador — o Wi-Fi voltar não quer dizer que o servidor esteja de pé.

- **Correção de texto que tinha virado mentira:** o painel dizia "valem
  só para este navegador" desde antes de as preferências passarem a ser
  gravadas na conta (11/09). Agora diz o que acontece de verdade —
  "acompanham a sua conta em qualquer máquina".

### 22/09/2026

- **Dois ajustes no gráfico de "Tendência Mensal de Atualizações"
  (`GraficoDeLinhas`).** O `cursor: crosshair` no SVG duplicava o crosshair que o
  componente já desenha (linha vertical + ponto + tooltip): em telas de
  alto DPI o cursor nativo do SO aparecia como uma cruz grande e sem
  relação com a escala do gráfico. Removido — o overlay próprio já basta.
  Também o rótulo do valor do último ponto (`line-chart__valor-fim`)
  ficava perto demais do halo desse ponto (r:14) com o offset antigo de
  10px, sobrepondo o número e lendo como "número cortado"; o offset subiu
  para 22px, com um piso (`padT + 10`) para não colidir com o topo do
  gráfico quando esse ponto está perto do máximo do eixo Y.
