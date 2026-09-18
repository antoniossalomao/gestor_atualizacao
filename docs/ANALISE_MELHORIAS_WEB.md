# Análise do Sistema Web

## Melhorias funcionais, técnicas e visuais

**Projeto:** Gestor de Atualizações  
**Data da análise:** 18 de setembro de 2026

---

## Sumário executivo

O sistema já está maduro para uso interno: possui boa separação por camadas, histórico de operações, backups verificados, preferências por usuário, paginação, proteção por CSP e acompanhamento dos agentes.

Os próximos avanços devem se concentrar em três frentes:

1. Proteger operações de alto impacto.
2. Ampliar os testes e a observabilidade.
3. Tornar a interface mais orientada por exceções e decisões.

A divisão entre as áreas deve ser preservada:

- **Versões:** enviar, publicar e administrar pacotes.
- **Distribuição:** acompanhar agentes, pendências e relatórios.

## 1. Melhorias de prioridade crítica (Implementadas em 18/09/2026)

### 1.1 Permissões mais granulares — `CONCLUÍDO`

Implementado sistema completo de RBAC (Role-Based Access Control) nos níveis de backend, banco de dados e interface.

| Papel | Permissões Efetivas |
|---|---|
| **Consulta** (`consulta`) | Apenas leitura: visualização de tabelas, gráficos de resumo, logs de agentes e exportação de dados. Formulários de criação, edição e exclusão são ocultados. |
| **Operador** (`operador`) | Operação diária: CRUD operacional de clientes, atualizações, agendamentos, observações de agentes e cadastro de rascunhos de versão. |
| **Administrador** (`admin`) | Controle total: gerenciamento de usuários e papéis, restauração e download de backups, publicação e exclusão de versões, configurações de API e exclusões em lote. |

**Detalhes da implementação:**
- **Migração do Banco de Dados:** Executada automaticamente no boot (`Database.js`). Usuários existentes com papel genérico foram convertidos para `operador`, e a conta `antoniosalomao` foi definida como `admin`.
- **Middleware `requireRole`:** Criado em `web/server/src/middlewares/requireRole.js` e acoplado às rotas em `src/routes/index.js`, bloqueando chamadas não autorizadas com HTTP 403.
- **Painel de Configurações:** Centralizada a administração de segurança dentro da janela de Configurações (com atalhos para Gestão de Usuários & Permissões, Backups e Chaves de API).
- **Gestão de Usuários:** Administradores podem definir e alterar papéis de usuários diretamente pela interface. Travas de segurança impedem rebaixamento ou exclusão do último administrador ativo.

### 1.2 Fluxo protegido para publicação de versões — `CONCLUÍDO`

A publicação e substituição de versões foi blindada contra falhas e estados inconsistentes:

- **Transação Atômica:** Método `publicarESubstituir` criado no `VersaoRepository.js`, executado dentro de uma transação SQLite do `better-sqlite3`. A desativação da versão anterior e ativação da nova versão ocorrem atomicamente.
- **Restrição de Perfil:** Apenas administradores (`admin`) possuem permissão para acionar a publicação ou exclusão de versões.
- **Validação Preventiva de Disco:** Antes de publicar, o servidor valida fisicamente a existência de todos os arquivos de pacotes (`.zip`) no disco local. Se o arquivo estiver ausente ou corrompido, a publicação é cancelada e o erro reportado.
- **Auditoria:** Registro automático de publicação e de substituição na trilha de auditoria (`HistoricoService`).

### 1.3 Endurecimento dos uploads — `CONCLUÍDO`

A ingestão de arquivos e cálculo de integridade foram otimizados para estabilidade e segurança:

- **Limites Rígidos no Multer:**
  - Planilhas de clientes/atualizações limitadas a 15 MB, com filtro de extensão e MIME para `.xlsx` e `.xls`.
  - Pacotes de atualização de versão limitados a 500 MB, com restrição de extensões aceitas (`.zip`, `.rar`, `.7z`, etc.).
- **SHA-256 por Stream Assíncrono:** Substituído o método síncrono bloqueante (`fs.readFileSync`) por stream de leitura assíncrono (`sha256Stream` usando `fs.createReadStream().pipe(crypto.createHash('sha256'))`). Isso impede o congelamento do Event Loop do Node.js durante o upload de arquivos grandes, garantindo que requisições concorrentes e heartbeats de agentes continuem respondendo normalmente.
- **Limpeza Automática de Falhas:** Caso ocorra erro de validação de metadados ou falha ao salvar a versão, qualquer arquivo temporário gravado em disco é removido de forma preventiva (`fs.unlinkSync`).

### 1.4 Proteção especial para restauração de backup — `CONCLUÍDO`

A restauração de backup recebeu camadas de segurança operacional para prevenir desastres:

- **Acesso Exclusivo de Administrador:** Rota protegida por `requireRole("admin")`; botões e atalhos de restauração ocultos para operadores e usuários de consulta.
- **Confirmação Dupla Obrigatória:** O modal exige que o administrador digite a palavra `RESTAURAR` exatamente em caixa alta.
- **Revalidação de Senha Administrativa:** Exige a senha atual do administrador logado, validada contra o hash bcrypt antes de qualquer ação no banco.
- **Download Preventivo:** Adicionado botão para baixar uma cópia do banco de dados atual em tempo real (`/api/backups/download-atual`) e botões para download individual de qualquer arquivo de backup histórico.
- **Invalidação Total de Sessões:** Ao concluir a restauração, o `SqliteSessionStore.clearAll()` expira todas as sessões ativas no `sessions.sqlite`. Todos os usuários conectados são desconectados imediatamente, forçando nova autenticação alinhada aos dados do banco restaurado.

## 2. Confiabilidade e qualidade

### 2.1 Ampliar os testes automatizados

Os testes existentes cobrem corretamente a classificação dos estados dos agentes, mas ainda faltam testes para os fluxos centrais:

- autenticação e permissões;
- CRUD, paginação e filtros;
- importação e exportação;
- backup e restauração;
- publicação, substituição e exclusão de versões;
- rotas do agente;
- falhas parciais de scripts;
- migrações e normalização;
- concorrência entre usuários;
- limpeza de arquivos órfãos.

Estratégia sugerida:

1. Testes unitários para serviços, validações e normalização.
2. Testes de integração HTTP usando um banco temporário.
3. Testes de navegador para os poucos fluxos realmente críticos.

Os testes de navegador prioritários seriam:

- login;
- importação de planilha;
- criação de atualização;
- upload e publicação de uma versão;
- exclusão de versão;
- filtros da Distribuição;
- modal de detalhes do agente;
- cópia de relatório;
- backup e restauração.

### 2.2 Controle de concorrência

Quando duas pessoas editam o mesmo registro, a última gravação pode substituir a anterior silenciosamente.

Uma solução simples seria:

- adicionar um campo `atualizado_em` ou um número de revisão;
- enviar essa revisão nas operações de atualização;
- devolver HTTP `409 Conflict` quando o registro tiver sido alterado por outra pessoa;
- apresentar a comparação entre a versão do usuário e a versão atual.

Isso é especialmente importante em Atualizações, Clientes, Agendamentos e versões em rascunho.

### 2.3 Centro de saúde operacional (CONCLUÍDO)

> Status: **CONCLUÍDO**
> - **Serviço e Endpoint de Diagnóstico:** Criado `SaudeService` e endpoint autenticado `GET /api/saude` (restrito ao perfil Administrador), avaliando integridade física SQLite via `PRAGMA integrity_check`, modo de journal (`WAL`), tamanho do arquivo do banco de dados, total e data do último backup, pacotes de distribuição em disco, estatísticas ao vivo dos agentes e métricas de processo Node.js (uptime, heap total e heap usado).
> - **Painel Operacional no Cliente:** Desenvolvido `SaudeSistemaPanel.js` em modal responsivo com status dot semântico pulsante, cards de subsistemas (SQLite, Servidor Node, Backups, Pacotes e Agentes), atualização sob demanda e atalho direto para a gestão de cópias de segurança. Acessível via menu de Configurações e Paleta de Comandos (`Ctrl+K`).

Criar uma tela administrativa “Saúde do sistema” com:

- banco ativo e tamanho;
- resultado do último `PRAGMA integrity_check`;
- data do último backup válido;
- espaço livre em disco;
- quantidade de sessões;
- versão do servidor;
- tempo em execução;
- último alerta enviado;
- status da integração com o Discord;
- pacotes órfãos;
- agentes ativos, offline e em erro;
- falhas recentes do backend.

Essa tela reduziria a dependência de abrir logs diretamente na máquina do servidor.

### 2.4 Logs estruturados

Adicionar:

- logs em JSON com rotação;
- identificador por requisição;
- duração e status das chamadas;
- usuário responsável;
- erro técnico completo somente no servidor;
- mensagem curta e compreensível na interface;
- consulta administrativa das falhas recentes.

Esse modelo combina com o padrão já utilizado nos relatórios dos agentes: resumo amigável para operação e conteúdo original preservado para auditoria.

### 2.5 Dependências

A auditoria de dependências ainda aponta vulnerabilidade moderada transitiva no pacote `uuid`, trazido pelo `exceljs`. O reparo automático propõe um downgrade incompatível e não deve ser executado sem avaliação.

Caminhos possíveis:

- acompanhar uma atualização do `exceljs` que elimine a dependência vulnerável;
- avaliar uma biblioteca alternativa para arquivos Excel;
- documentar formalmente a aceitação temporária do risco;
- validar rigorosamente todo conteúdo importado.

## 3. Funcionalidades recomendadas

### 3.1 Regras automáticas e SLA

Criar regras para situações como:

- agente sem contato há determinado número de horas;
- versão não instalada após determinado prazo;
- autorização pendente por muito tempo;
- scripts parcialmente aplicados;
- cliente crítico fora da versão-alvo;
- versão publicada sem nenhuma adoção;
- taxa de erro acima de determinado percentual.

Cada ocorrência poderia ter:

- severidade;
- responsável;
- reconhecimento;
- prazo;
- comentário;
- estado “Resolvido”.

### 3.2 Comparação de versões por cliente (CONCLUÍDO)

> Status: **CONCLUÍDO**
> - **Matriz de Versões em Consulta:** Implementada matriz comparativa dinâmica na tela de Consulta do cliente, consolidando Sistemas cadastrados, histórico recente e dados em tempo real dos agentes do Atualizador.
> - **Colunas e Indicadores:** Exibe `Sistema | Instalada | Publicada | Estado | Último contato`, identificando automaticamente versões defasadas (`Atrasado`), alinhadas (`Atualizado`), agentes offline ou sem publicação ativa com chips de versão e badges semânticos de status.

Na Consulta do cliente, incluir uma matriz como:

| Sistema | Instalada | Publicada | Estado | Último contato |
|---|---:|---:|---|---|
| B_Vendas | 8.4.1 | 8.5.0 | Atrasado | há 2h |
| B_NFe | 4.2.0 | 4.2.0 | Atualizado | há 2h |

Essa visão reuniria informações hoje espalhadas entre Consulta, Sistemas e Distribuição.

### 3.3 Changelog estruturado

Além das observações livres da versão, registrar:

- tipo: correção, melhoria, segurança ou banco;
- impacto;
- necessidade de parada;
- necessidade de script;
- reversibilidade;
- compatibilidade mínima;
- instruções de validação;
- problemas conhecidos.

Esses dados poderiam aparecer no relatório da implantação e no detalhe do agente.

### 3.4 Histórico com comparação antes e depois

O Histórico ficaria mais útil mostrando:

- campos alterados;
- valor anterior;
- valor novo;
- origem da alteração;
- link para o registro relacionado.

Para exclusões, recomenda-se guardar um snapshot JSON do registro removido.

### 3.5 Notificações configuráveis

Além do Discord, adicionar:

- resumo diário de pendências;
- alertas somente para falhas críticas;
- alertas por sistema;
- horários silenciosos;
- destinatários diferentes para publicação, agente offline e falha SQL;
- botão “Reconhecer alerta” no painel.

### 3.6 Pesquisa global operacional (CONCLUÍDO)

> Status: **CONCLUÍDO**
> - **Busca Universal no Ctrl+K:** Paleta de comandos expandida para pesquisar não apenas telas e clientes, mas também versões publicadas no ar (com atalho direto para filtragem na Distribuição) e agentes que apresentam incidentes ou falta de comunicação (com busca rápida pelo nome/CNPJ na Distribuição).
> - **Comandos de Ação Direta:** Atalhos operacionais integrados: "Nova Atualização", "Novo Agendamento", "Ver Incidentes da Distribuição", "Saúde Operacional do Sistema" e controle de preferências.
> - **Deep-linking e Parâmetros entre Views:** Suporte a `aplicarParams` estendido em `DistribuicaoView`, `AgendamentosView`, `AtualizacoesView` e `ConsultaView`, permitindo que buscas como `offline` ou sistemas levem o operador ao estado filtrado com foco imediato no formulário ou na linha do incidente.

O `Ctrl+K` já é uma boa base e poderia pesquisar:

- código, nome e CNPJ de clientes;
- versões;
- agendamentos;
- agentes em falha;
- comandos como “Nova atualização”;
- ações administrativas permitidas ao usuário.

Uma busca como `offline B_NFe` poderia abrir a Distribuição já filtrada.

## 4. Melhorias visuais (CONCLUÍDO)

> Status: **CONCLUÍDO**
> - **4.1 Navegação agrupada:** Abas da sidebar categorizadas em grupos lógicos (*Visão Geral*, *Operação*, *Distribuição*, *Administração*) com cabeçalhos de grupo que se transformam em linhas divisórias no modo colapsado, além de tooltips flutuantes CSS com elevação e blur ao passar o cursor sobre os ícones.
> - **4.2 Resumo orientado a decisões:** Seção *"Precisa de atenção"* no topo do Resumo, exibindo cards de severidade para agentes com falha (vermelho), agentes sem contato (amarelo), agentes com pendências (amarelo) e agendamentos atrasados (vermelho), com navegação com um clique direto para a tela de destino correspondente. Exibe estado de *tudo limpo* com radar dot pulsante quando não há incidentes.
> - **4.3 Tabelas menos densas & barra flutuante:** Barra de ações em lote (`.bulk-bar`) modernizada para doca flutuante com blur centralizada no rodapé (estilo Linear/Retool). Filtros ativos agora são exibidos em chips removíveis (`.filter-chips`) com botão de remoção rápida.
> - **4.4 Distribuição como painel de incidentes:** Agentes ordenados por gravidade de severidade (`erro` > `aguardando_autorizacao_demorada` > `offline` > `pendencias` > `desatualizado` > `ok`) e tempo sem contato. Linhas com falhas destacadas com borda esquerda semântica. Novo botão de ação *"Diagnóstico"* que copia instantaneamente o relatório completo do agente para a área de transferência.
> - **4.5 Linha do tempo das versões:** Mini-timeline visual de ciclo de vida (`Rascunho → Publicada → Em distribuição → Substituída`) adicionada aos cards de versões publicadas com indicadores visuais de progresso e radar dot de pulso ativo.
> - **4.6 Semântica consistente de cores:** Paleta semântica de 4 camadas adicionada a `theme.css` (`--status-*-bg`, `--status-*-borda`, `--status-*-solido`, `--status-*-texto`) em ambos os temas escuro e claro com WCAG AA. "Concluído com pendências" estritamente padronizado em amarelo (`--status-alerta`).
> - **Polimento & Micro-interações:** Ponto de status com pulso ativo (`.status-dot.is-pulsing`), feedback tátil de clique com compressão (`transform: scale(0.98)`), animações de entrada refinadas com curvas deceleration expo (`cubic-bezier(0.16, 1, 0.3, 1)`).

### 4.1 Navegação agrupada

Organização implementada na sidebar:

| Grupo | Telas |
|---|---|
| Visão Geral | Resumo |
| Operação | Atualizações, Agendamentos, Clientes e Consultar cliente |
| Distribuição | Distribuição, Versões e Sistemas |
| Administração | Histórico; backups, usuários e API no menu administrativo |

### 4.2 Resumo orientado a decisões

Faixa “Precisa de atenção” implementada acima dos indicadores:
- agentes em falha;
- agentes sem contato / offline;
- atualizações com pendências de scripts;
- agendamentos atrasados.
Cada card abre diretamente a tela correspondente com o filtro já aplicado.

### 4.3 Tabelas menos densas

- Exibição de filtros ativos em chips removíveis;
- Doca flutuante de ações com backdrop-filter no rodapé quando há seleção em lote;
- Cabeçalhos fixos com indicação de ordenação;
- Feedback de atalho de teclado Shift+Clique documentado e integrado.

### 4.4 Distribuição como painel de incidentes

- Agentes ordenados por severidade e tempo sem contato;
- Destaque visual por borda e fundo para falhas e pendências;
- Ação rápida de diagnóstico com cópia direta para a área de transferência;
- Ações de pausar, retomar e excluir com controle de permissões.

### 4.5 Linha do tempo das versões

Ciclo de vida visual implementado nos cards de versões publicadas:
```text
Rascunho → Publicada → Em distribuição → Substituída
```

### 4.6 Semântica consistente das cores

| Cor | Significado | Tokens |
|---|---|---|
| Verde | Concluído e saudável | `--status-ok-*` |
| Amarelo | Aguardando ou exige atenção | `--status-alerta-*` |
| Vermelho | Falha atual | `--status-erro-*` |
| Azul | Em andamento | `--status-info-*` |
| Cinza | Sem informação ou inativo | `--status-neutro-*` |

## 5. Roadmap recomendado

| Ordem | Entrega |
|---:|---|
| 1 | Permissões e proteção de restauração e publicação. |
| 2 | Limites, validação e limpeza dos uploads. |
| 3 | Testes de integração dos fluxos críticos. |
| 4 | Publicação transacional, grupo piloto e rollback. |
| 5 | Central “Precisa de atenção” no Resumo. |
| 6 | Campanhas e acompanhamento de adoção. |
| 7 | Comparação entre versão instalada e publicada por cliente. |
| 8 | Controle de concorrência e revisão dos registros. |
| 9 | Saúde do servidor e logs estruturados. |
| 10 | Refinamento visual das tabelas e da navegação. |

## Conclusão

A próxima entrega com melhor relação entre esforço e impacto deve reunir:

- permissões mais granulares;
- endurecimento dos uploads;
- testes HTTP dos fluxos críticos;
- uma central de pendências operacionais no Resumo.

Esse conjunto aumenta a segurança, a confiança operacional e a clareza visual sem exigir a reescrita da arquitetura atual.

---

_Documento produzido a partir da auditoria técnica do projeto em 18/09/2026._
