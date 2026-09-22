# Gestor de Atualizações — Documentação Consolidada

**Bredas Sistemas** · Painel web de gestão de clientes/atualizações + Atualizador Inteligente de ERP (agente local)

Documento único que reúne, atualiza e substitui todos os relatórios, auditorias, especificações e
apresentações que existiam soltos em `web/docs/`. Cada afirmação técnica abaixo foi conferida
contra o código-fonte real em setembro de 2026 — onde um documento antigo dizia uma coisa e o
código dizia outra, o código venceu, e a divergência está registrada na [seção 6](#6-auditoria-de-agostoset2026-o-que-mudou-desde-então).

| | |
|---|---|
| **Versão deste documento** | 1.4 |
| **Data** | 22 de setembro de 2026 |
| **Autor** | Antonio Salomão |
| **Nesta revisão** | Incorporados o resumo executivo (seção 0) e as decisões de arquitetura — ADRs (seção 4), que existiam como arquivos separados em `web/docs/` |
| **Substitui** | Ver [seção 7 — histórico deste documento](#7-histórico-deste-documento-o-que-foi-consolidado) |

> ### Este documento é uma fotografia, não a fonte da verdade
>
> Ele existe para ser **lido inteiro, de uma vez** — por alguém que chega ao projeto, por quem vai
> apresentar o projeto para a diretoria (seção 0), ou por quem precisa de uma visão completa dos
> dois lados num arquivo só. Isso o torna útil, e também o torna o documento que **envelhece mais
> rápido**: tudo que ele descreve está descrito também em algum lugar que muda junto com o código.
>
> **Quando este documento e outro discordarem, o outro está certo.** A ordem de precedência:
>
> | Assunto | Onde está a verdade |
> |---|---|
> | Como rodar, instalar, o que o sistema faz | `web/README.md`, `atualizador/README.md` |
> | Onde colocar cada coisa, como testar | `CONTRIBUTING.md` de cada metade |
> | **Por que** foi feito assim | Seção 4 deste documento (painel web); `atualizador/docs/adr/` (agente C#) |
> | O que mudou e quando | [`web/CHANGELOG.md`](CHANGELOG.md) |
> | O que ainda falta fazer | [`docs/MELHORIAS.md`](MELHORIAS.md) |
> | O que fazer quando quebra | [`docs/OPERACAO.md`](OPERACAO.md) |
> | O que ainda pode dar errado no agente | [`atualizador/RISCOS-CONHECIDOS.md`](../../atualizador/RISCOS-CONHECIDOS.md) |
>
> Ao alterar o código, atualize **aquele** documento. Este aqui é revisado de tempos em tempos,
> comparando com o código — como foi feito em set/2026, quando as seções 2.2 e 4 tinham ficado
> para trás, e novamente em 22/09/2026, quando o resumo executivo e os ADRs foram incorporados.

---

## Sumário

0. [Resumo executivo](#0-resumo-executivo) — para quem vai apresentar o projeto sem entrar em
   detalhe técnico
1. [Visão geral do projeto](#1-visão-geral-do-projeto)
2. [Painel web — Gestor de Atualizações](#2-painel-web--gestor-de-atualizações)
   — inclui [2.7 Mudanças de 11/09/2026](#27-mudanças-de-11092026),
   [2.8 Mudanças de 15/09/2026](#28-mudanças-de-15092026) e
   [2.9 Revisão de interface e Configurações](#29-revisão-de-interface-e-configurações--15092026)
3. [Atualizador Inteligente de ERP — agente local (C#)](#3-atualizador-inteligente-de-erp--agente-local-c)
4. [Decisões de arquitetura — ADRs do painel web](#4-decisões-de-arquitetura--adrs-do-painel-web)
5. [Como verificar](#5-como-verificar)
6. [Auditoria de agosto/set 2026 — o que mudou desde então](#6-auditoria-de-agostoset2026-o-que-mudou-desde-então)
7. [Histórico deste documento](#7-histórico-deste-documento-o-que-foi-consolidado)

---

## 0. Resumo executivo

> Esta seção é o conteúdo que antes vivia em
> `APRESENTACAO_EXECUTIVA_ATUALIZACAO_ERP.md`, um arquivo à parte pensado para quem vai apresentar
> o projeto para a diretoria sem entrar em detalhe técnico. Incorporado aqui em 22/09/2026 — ver
> [seção 7](#7-histórico-deste-documento-o-que-foi-consolidado). Quem só precisa desta parte pode
> copiá-la para um documento à parte sem perda: ela não depende do resto do arquivo.

**Gestor de Atualizações + Agente Atualizador ERP** · Bredas Sistemas

Transformação do processo de atualização de ERP de um modelo 100% manual, demorado e arriscado
(via AnyDesk máquina por máquina) em uma esteira segura, automatizada, padronizada e monitorada em
tempo real por um painel central de comando.

### 0.1 O problema que motivou o projeto

Hoje, cada nova versão do ERP (com melhorias fiscais, novas telas ou correções) exige da equipe de
suporte um procedimento manual e repetitivo para cada cliente da carteira.

**Como funciona o modelo manual atual (gargalo operacional):**

1. O suporte agenda um horário com o cliente.
2. Conecta no servidor do cliente via AnyDesk ou TeamViewer.
3. Executa manualmente uma sequência de 8 passos delicados: solicitar a saída de todos os usuários
   do sistema; fazer backup de segurança do banco Firebird; renomear os executáveis legados;
   copiar manualmente os novos executáveis baixados; abrir ferramenta de banco e rodar scripts SQL
   de atualização; conferir manualmente logs e integridade de tabelas/colunas; gerar um novo backup
   pós-atualização; abrir o sistema numa estação para testar o login.
4. Repete exatamente esse processo em cada um dos clientes da carteira.

**As dores e custos desse modelo:**

- **Tempo e custo excessivo de suporte** — cada cliente consome de 30 a 60 minutos de um técnico;
  atualizar 50 clientes consome de 30 a 50 horas só com cópia de arquivos e espera de telas.
- **Risco humano no banco de dados** — queda de conexão no AnyDesk, ordem trocada de scripts SQL
  ou passo esquecido pode corromper o banco Firebird do cliente e paralisar a operação dele.
- **Falta de visibilidade central** — sem lugar centralizado para responder rápido a "quantos
  clientes já estão na versão nova?", "quem ainda está desatualizado?", "quando foi a última
  atualização do cliente X?".
- **Gargalo para expansão** — a carteira de clientes não escala sem aumentar a equipe de suporte só
  para atualizações.

### 0.2 Visão geral da solução: os dois pilares

O projeto ataca o problema em duas frentes complementares, conectadas por uma API central segura:

```
[ BREDAS SISTEMAS ]                               [ SERVIDOR DO CLIENTE ]
 ┌───────────────────────────┐                     ┌─────────────────────────────┐
 │   GESTOR DE ATUALIZAÇÕES  │◄──── Conexão ──────►│   AGENTE ATUALIZADOR ERP    │
 │       (Painel Web)        │      Segura (API)   │      (Serviço Windows C#)   │
 └───────────────────────────┘                     └─────────────────────────────┘
  • Central de comando da equipe                    • Robô local silencioso
  • Publica versões e scripts                       • Baixa, valida e aplica
  • Monitora incidentes e telemetria                • Isola banco e roda scripts
  • Controle de acessos e auditoria                 • Atualiza terminais sozinho
```

| Componente | O que é | Onde roda | Papel no negócio |
|---|---|---|---|
| **Gestor de Atualizações** (Central de Comando) | Painel web corporativo em Node.js + Express + SQLite, acessível pelo navegador | Servidor interno da Bredas | Onde a equipe publica versões, gerencia clientes, controla acessos, acompanha status de agentes em tempo real e visualiza métricas |
| **Agente Atualizador ERP** (Assistente Local) | Serviço Windows nativo e silencioso em C# (.NET 8) | Servidor local de cada cliente (ao lado do Firebird) | Executa sozinho todo o processo: consulta a API, baixa versão, valida integridade, aplica scripts SQL, atualiza executáveis e reporta o status |

**Como os dois conversam (segurança e arquitetura):**

- **Conexão segura de dentro para fora (outbound polling)** — o agente consulta a API da Bredas via
  internet com token compartilhado seguro. Não há portas abertas nem necessidade de IP fixo no
  servidor do cliente, operando normalmente atrás de roteadores e firewalls (NAT).
- **Operação silenciosa** — sem versão nova, o agente volta a dormir sem consumir memória ou CPU.
- **Telemetria e alertas imediatos** — o agente reporta logs detalhados e tempos de execução; se
  houver falha ou um agente ficar sem contato por mais de 24 horas, o painel acende alerta visual
  imediato e notifica a equipe via Discord.

### 0.3 O fluxo das 4 fases: segurança em primeiro lugar

Para garantir risco zero de parada na operação do cliente, o agente foi projetado com uma esteira
estrita de 4 fases sequenciais blindadas (detalhe técnico completo na [seção 3.2](#32-como-funciona--máquina-de-estados)):

- **Fase 1 — Preparo silencioso (download e validação).** O agente baixa o pacote da versão nova
  em segundo plano. Validação criptográfica (SHA-256): se a conexão oscilar ou o arquivo
  corromper, o pacote é descartado imediatamente. O cliente continua trabalhando sem perceber
  nenhuma lentidão.
- **Fase 2 — Permissão e respeito ao cliente (autorização).** O sistema nunca derruba o cliente de
  surpresa: quando o pacote está pronto, o ERP Delphi avisa o usuário ("Uma nova versão está
  pronta. Deseja aplicar agora?"). O cliente escolhe a melhor hora; ao confirmar, o ERP grava a
  autorização e o agente assume o processo. **Esta fase ainda não foi escrita no ERP Delphi** — ver
  [seção 3.4](#34-estado-atual-pré-piloto).
- **Fase 3 — Execução crítica com escudo total (banco Firebird e scripts).** O agente desconecta os
  usuários externos do banco (`gfix -shut`), gera um backup completo via `gbak` antes de tocar em
  qualquer dado, aplica os scripts SQL em duas passadas, e devolve o banco ao ar. Rollback
  automático garantido: se qualquer comando SQL falhar ou faltar energia, o agente interrompe,
  restaura o backup inicial e devolve o banco ao estado funcional anterior. O cliente nunca
  amanhece com o sistema quebrado.
- **Fase 4 — Distribuição automática para os terminais.** O agente grava os novos executáveis na
  tabela central (`BEXE.fdb`); as estações e caixas da rede local baixam os executáveis atualizados
  ao abrirem o ERP, sem precisar atualizar máquina por máquina. O agente envia o relatório de
  sucesso para o Gestor Web.

### 0.4 O que já está pronto e em funcionamento hoje

O projeto atingiu maturidade técnica elevada em ambos os repositórios. Detalhe técnico completo nas
seções [2](#2-painel-web--gestor-de-atualizações) e [3](#3-atualizador-inteligente-de-erp--agente-local-c);
resumo aqui:

**Gestor de Atualizações (painel web) — em uso operacional:**

- Canais de distribuição e versões piloto, com promoção para geral e rollback transacional.
- Controle de concorrência otimista (OCC) — revisões atômicas, impedindo que edições simultâneas
  entre técnicos sobrescrevam dados sem aviso.
- Ficha 360° do cliente — histórico completo de atendimentos, cópia rápida de acessos remotos,
  linha do tempo de eventos e matriz comparativa de versões (instalada vs. publicada).
- Trilha de auditoria visual — log completo (quem criou, editou ou excluiu) com diff visual
  antes/depois campo a campo.
- Telemetria de agentes ao vivo — monitoramento em tempo real do parque de clientes.
- Gestão de agendamentos em lista e quadro Kanban interativo.
- Paleta de comandos universal (`Ctrl+K`) e navegação completa por atalhos de teclado.
- Suporte a temas claro, escuro e sistema, com cache inteligente (stale-while-revalidate).
- Suíte de testes automatizados e verificação estrita de tipos — ver [seção 5](#5-como-verificar)
  para o número atual (a contagem muda com frequência; não fixada aqui de propósito).

**Agente Atualizador ERP (serviço C#/.NET 8) — pré-piloto homologado:**

- Assistente gráfico de configuração (`SetupForm`) para instalar e configurar o agente no servidor
  do cliente em poucos minutos, com botão de testar conexão.
- Validação de ambiente no boot — confere se os utilitários do Firebird e o banco estão acessíveis
  antes de iniciar o loop de trabalho.
- Auto-recuperação de interrupções — reinício ou falta de energia no meio de uma atualização é
  detectado e o banco é recuperado automaticamente para o estado seguro.
- Motor robusto de scripts Firebird — tratamento automático de triggers e stored procedures,
  execução em 2 passadas para dependências cíclicas.
- Pausa remota da atuação do agente via painel web.
- Homologado com banco real — ciclo completo testado repetidamente contra cópia real do banco
  Firebird do `B_Vendas` (366 tabelas, mais de 1.000 scripts SQL reais).
- Testes automatizados de integração cobrindo os fluxos do Worker e de rollback.

### 0.5 Riscos mapeados e como cada um foi blindado

| Risco mapeado | O que poderia acontecer | Como o sistema foi blindado | Situação |
|---|---|---|---|
| Queda de energia ou reinício durante atualização | Banco Firebird ficar bloqueado ou inacessível | O agente detecta no boot interrupções não finalizadas e restaura o banco automaticamente a partir do backup inicial | Resolvido e testado |
| Falha em script SQL do banco | Cliente ficar com schema incompleto ou dados corrompidos | O motor interrompe na hora, executa rollback, restaura o backup prévio e devolve o banco ao ar funcional | Resolvido e testado |
| Arquivo corrompido no download | Executável danificado ser gravado na pasta do cliente | Validação estrita de hash SHA-256 antes da extração; se 1 byte diferir, o pacote é descartado | Resolvido e testado |
| Operador publicar versão errada para todos | Pacote não testado ser enviado a toda a base de clientes | Canal de versões piloto com transação atômica e permissão restrita a administradores | Resolvido e testado |
| Conflito de edição simultânea no painel | Um operador sobrescrever alterações de outro | Controle de concorrência otimista (OCC) com verificação de revisão atômica | Resolvido e testado |
| Scripts antigos serem reaplicados | Erro de "tabela ou coluna já existente" no banco | O agente consulta o histórico da tabela `SCRIPTS` e pula arquivos já executados | Mitigado — requer triagem no piloto |
| Atualização ocorrer durante venda no caixa | Caixa travar na frente do consumidor | O agente só inicia a execução após autorização explícita do usuário no ERP (Fase 2) | Pendente de tela no Delphi |
| Processo externo travar o servidor do cliente | `gfix` ou `gbak` ficarem travados indefinidamente | Timeout obrigatório com encerramento forçado em qualquer chamada de processo externo | Resolvido e testado |

### 0.6 Ganhos do negócio

- **Eficiência máxima da equipe de suporte** — elimina horas de conexão remota repetitiva via
  AnyDesk; a equipe fica livre para suporte consultivo, novos recursos e relacionamento com cliente.
- **Agilidade de distribuição em massa** — atualizações críticas (notas técnicas urgentes da SEFAZ)
  que levavam dias ou semanas para cobrir a base agora podem ser aplicadas em minutos, coordenadas.
- **Fim das falhas humanas e padronização** — o mesmo procedimento auditado roda em 100% dos
  clientes; alertas preventivos avisam a equipe antes mesmo do cliente notar.
- **Escalabilidade real da empresa** — a carteira pode dobrar ou triplicar sem contratação
  proporcional só para sustentar atualizações.

### 0.7 O que falta para o piloto e próximos passos

O projeto está tecnicamente pronto para iniciar a operação supervisionada. Restam etapas práticas
de campo:

```
ETAPA 1                    ETAPA 2                   ETAPA 3                    ETAPA 4
Ajuste Delphi (Fase 2)     Triagem do Piloto         Piloto Supervisionado      Liberação Gradual
┌──────────────────┐       ┌──────────────────┐      ┌──────────────────┐       ┌──────────────────┐
│ Janela simples   │  ──►  │ Alinhar tabela   │  ──► │ Instalar agente  │  ──►  │ Liberar para     │
│ de confirmação   │       │ SCRIPTS do       │      │ no Cliente 01 e  │       │ grupos de 5, 10, │
│ no ERP existente │       │ cliente piloto   │      │ acompanhar ao vivo│      │ 20 clientes      │
└──────────────────┘       └──────────────────┘      └──────────────────┘       └──────────────────┘
```

1. **Janela de confirmação no ERP Delphi (Fase 2).** No código Delphi do ERP, adicionar uma
   checagem simples na abertura: se houver registro com status `PENDENTE` na tabela
   `SYS_ATUALIZACAO`, exibe a pergunta ao usuário. Ao clicar em Sim, o ERP grava `AUTORIZADO` e
   fecha o sistema para o agente assumir.
2. **Triagem de scripts do cliente piloto 01.** Selecionar um cliente parceiro de baixo risco;
   conferir os scripts que esse cliente já possui aplicados, garantindo que a tabela `SCRIPTS`
   reflita o estado inicial correto.
3. **Execução supervisionada do piloto.** Usar o `SetupForm` para instalar e configurar o agente no
   servidor do Cliente Piloto 01; publicar uma versão no canal piloto e acompanhar o ciclo completo
   em tempo real pelo painel e pelos alertas do Discord.
4. **Expansão gradual da base.** Validado o primeiro ciclo em produção real, iniciar implantação em
   lotes controlados (5, 10, 20 clientes) até cobrir toda a base.

**Repositórios:** código-fonte estruturado em dois repositórios independentes com versionamento
Git completo — `github.com/antoniossalomao/gestor_atualizacao` (painel web + API central) e
`github.com/antoniossalomao/atualizador_automatico` (agente Windows C# .NET 8).

---

## 1. Visão geral do projeto

Hoje, atualizar o ERP num cliente da Bredas depende de alguém da equipe entrar remotamente
(AnyDesk) no servidor de cada cliente e, na mão: fazer backup do banco, trocar executáveis, rodar
scripts de atualização de banco e testar se funcionou — servidor por servidor. Isso consome tempo
da equipe de suporte, não escala com o número de clientes, e cada passo manual é uma chance de
esquecimento (backup pulado, script no banco errado, cliente interrompido no meio de uma venda).

O projeto ataca esse problema em duas frentes independentes, cada uma num estágio de maturidade
diferente:

| Frente | O que é | Tecnologia | Estado |
|---|---|---|---|
| **Painel web** (`web/`) | Sistema multiusuário para a equipe cadastrar clientes, registrar atualizações/agendamentos, publicar pacotes de versão e acompanhar o parque de agentes instalados | Node.js + Express + SQLite (backend), JavaScript puro sem framework (frontend) | **Em produção**, uso diário da equipe |
| **Atualizador Inteligente de ERP** (`atualizador/`) | Agente que roda como serviço Windows no servidor de cada cliente: baixa a versão publicada no painel, aplica scripts de banco e distribui os executáveis novos, sem acesso remoto manual | C# / .NET 8 Worker Service, driver Firebird nativo | **Pré-piloto** — compila, o ciclo completo já rodou de ponta a ponta contra Firebird real, mas ainda falta a Fase 2 (participação do ERP Delphi) para poder atualizar um cliente de verdade |

As duas frentes se conectam por uma API HTTP: o painel web publica pacotes de versão por
sistema (B_Vendas, B_NFe, B_Ordem, ...); o agente local consulta essa API, baixa o pacote da
versão do sistema que ele cuida, e reporta de volta o resultado de cada execução. O painel
consolida esses relatos num painel de acompanhamento (quantos clientes estão atualizados, quantos
falharam, quantos sumiram).

### Arquitetura em três pilares (o agente C#)

| Pilar | Tecnologia | Responsabilidade |
|---|---|---|
| **A Mente** — API central | Node.js, Express, SQLite (o painel web da seção 2) | Gerenciar versões, pacotes, clientes, publicação, autenticação web e logs dos agentes |
| **O Músculo** — agente local | C# / .NET 8 Worker Service | Operar no servidor do cliente: download, extração, aplicação de scripts SQL, injeção dos executáveis novos |
| **O Rosto** — ERP e terminais | Delphi (código existente, `b_vendas` e afins) | Ler o estado da atualização, avisar o usuário e registrar a autorização no momento certo — **esta parte ainda não foi escrita**, ver [3.4](#34-estado-atual-pré-piloto) |

---

## 2. Painel web — Gestor de Atualizações

### 2.1 O que é

Reescrita em Node.js + JavaScript puro do app desktop original (Python/Tkinter, pasta `gestor/`
na raiz do projeto, mantida intacta como referência). Faz a mesma coisa — controlar atualizações
de sistemas em clientes, uma agenda de tarefas internas e o cadastro de clientes — só que agora
como um servidor web acessível por várias pessoas ao mesmo tempo, cada uma com seu próprio login.

**O que mudou em relação ao app desktop:**

- **Login multiusuário.** O app original era de uso individual; agora cada pessoa da equipe tem
  usuário e senha próprios. A primeira conta criada vira administrador automaticamente; depois
  disso, qualquer pessoa logada pode convidar novas contas pela tela **Usuários** — só
  administradores podem remover contas, e ninguém pode remover a própria conta nem a última que
  resta.
- **Servidor em vez de aplicativo instalado** — um processo Node roda num lugar só (PC, servidor
  da empresa ou nuvem), e a equipe acessa pelo navegador.
- **Mesmo banco (SQLite), mesmas regras de negócio** — nome de cliente único, renomear cliente
  propaga o novo nome para o histórico, backup automático a cada início do servidor.
- **Aba Histórico**, nova: registra quem criou/editou/excluiu cada cliente, atualização,
  agendamento, sistema e conta, e quem restaurou cada backup — necessário agora que várias pessoas
  usam o mesmo sistema ao mesmo tempo.
- **Aba Sistemas**, nova: filtra clientes por sistema e por uma data de corte opcional, para achar
  quem ficou pra trás depois de uma mudança grande.
- **Paginação** nas listas que crescem (Atualizações, Agendamentos, Clientes, Histórico), com
  ordenação calculada no servidor.
- **Segurança de servidor web**: cabeçalhos HTTP de proteção (`helmet`) e limite de tentativas de
  login por IP — o app original, local e sem login, não precisava de nenhum dos dois.
- **Notificação no Discord** (opcional, `DISCORD_WEBHOOK_URL`): avisa um canal a cada atualização
  cadastrada e quando um agente do Atualizador automático fica offline/com erro.

**Funcionalidades adicionadas em set/2026:**

- **Alerta proativo de agente offline/com erro** (`AlertaAgenteService`) — confere sozinho, a cada
  `ALERTA_AGENTES_INTERVALO_MINUTOS` (padrão 15 min), a situação de cada agente do Atualizador
  automático e avisa o Discord só na *transição* para "offline" (24h+ sem contato) ou "erro" — não
  repete o aviso a cada ciclo enquanto o problema continua.
- **Tendência mensal de atualizações** (Resumo) — gráfico dos últimos 12 meses.
- **Grupo/Rede de clientes** — campo opcional para agrupar unidades sob a mesma bandeira.
- **Converter Agendamento em Atualização** — botão que pré-preenche um novo registro de
  Atualização a partir de uma tarefa de Agendamentos.
- **Tempo médio de resolução por responsável** (Resumo) — só conta tarefas criadas depois desta
  métrica existir, pra não inventar uma data que não existe.

### 2.2 Arquitetura do código

```
navegador (client/)  <--HTTP/JSON-->  Express (server/)  <-->  SQLite (gestao.db)
```

Um único processo Node serve tudo: os arquivos estáticos do front-end e a API JSON (`/api/...`).
Sem build step, bundler ou transpilação em nenhum dos dois lados.

**Backend (`server/`)**, em camadas, de fora para dentro:

```
rotas (routes/)  ->  controllers/  ->  services/  ->  database/ (repositórios)  ->  SQLite
```

- **`database/`** — uma classe `Database` (conexão, migrações, backup automático) e um
  `Repository` por tabela. **Só aqui existe SQL** — nenhuma outra camada monta uma query
  diretamente.
- **`services/`** — regras de negócio (validação, propagação de rename, cálculo dos indicadores do
  Resumo, import/export de planilha, login). No Python original ficavam misturadas dentro de cada
  `View` do Tkinter; aqui viraram classes próprias, testáveis sem simular uma requisição HTTP.
- **`controllers/`** — finos de propósito: recebem a requisição, chamam o serviço certo, devolvem
  a resposta.
- **`routes/index.js`** — só o mapeamento verbo HTTP + caminho → método do controller. Rotas de
  `/api/auth/...` não passam pelo middleware `requireAuth`; todo o resto passa.
- **`Server.js`** — classe raiz: cria o `Database`, monta serviços/controllers (injeção de
  dependência simples, na mão) e configura o Express.

**Por que `better-sqlite3` (síncrono) e não `sqlite3`/`node:sqlite`:** os métodos de repositório
não usam `await`. Foge do padrão assíncrono comum em Node, mas segue a mesma filosofia de código
direto que o `sqlite3` do Python já usava — o SQLite lê do disco rápido o bastante para
"assíncrono" não trazer benefício, só complexidade.

**Erros:** `shared/errors.js` define `ValidationError` (400) e `NotFoundError` (404) — erros
esperados, com mensagem segura de mostrar ao usuário. Qualquer outro erro vira 500 genérico, sem
vazar detalhe interno.

**Sessão de login:** `database/SqliteSessionStore.js` é uma classe própria (estende
`session.Store`) que guarda sessões num `sessions.sqlite` separado, usando a mesma
`better-sqlite3` do resto do app — evita depender de `connect-sqlite3`, que traz `sqlite3` +
`node-gyp`, cadeia com vulnerabilidades conhecidas de build.

**Front-end (`client/`)** — JavaScript puro, orientado a objetos, carregado como ES Modules direto
pelo navegador, sem bundler:

```
app/App.js        -- classe raiz: login vs. shell principal, troca de aba, mantém cada View viva
app/View.js       -- classe base: listeners rastreados (removidos no destroy()) + ciclo
                     stale-while-revalidate
app/*.js          -- o esqueleto: router, prefs, SwrCache, theme, appearance, notify, Shortcuts
components/*.js   -- peças de UI reaproveitáveis: SortableTable, Pagination, Autocomplete, Modal,
                     Toast, CommandPalette (Ctrl+K), EmptyState, ConexaoBanner, ReminderBanner,
                     MenuConta
components/charts -- PieChart, BarChart, LineChart (SVG escrito à mão)
domain/*.js       -- vocabulário do negócio, SEM tocar no DOM: agenteStatus, agenteReport,
                     agenteLabels, relatorio, pessoa. É o que dá para testar fora do navegador
utils/*.js        -- utilidades genéricas: date, html, color, icons, debounce, guard, arquivo
views/*.js        -- uma classe por tela (Resumo, Atualizações, Agendamentos, Clientes, Consultar
                     Cliente, Distribuição, Versões, Sistemas, Histórico, Login) e os painéis
                     (Configurações, Backups, Usuários, Saúde, Configuração da API)
api/ApiClient.js  -- único lugar que chama fetch; todo o resto fala com o servidor por ele

app/theme.js + app/appearance.js + views/ConfiguracoesPanel.js
             -- as preferências do usuário. theme.js cuida só de claro/escuro/sistema;
                appearance.js cuida do resto (cor de destaque, tamanho do texto, densidade e
                altura das tabelas, linhas por página, animações, fundo, posição dos avisos,
                tela inicial, lembrar filtros). Escrevem um atributo no <html> (data-tema,
                data-realce, data-densidade, ...) que o CSS lê -- nenhum componente conhece as
                preferências. ConfiguracoesPanel.js é o painel de duas colunas com busca que
                expõe tudo isso.
                As preferências são da CONTA: ficam em usuario_preferencias no servidor
                (GET/PUT /api/preferencias). O localStorage continua sendo escrito, mas como
                cache -- theme-init.js roda no <head> e precisa de resposta síncrona, senão a
                página nasceria no tema errado e trocaria na cara de quem olha. prefs.js
                (conectarPreferencias) busca as da conta no login e corrige o cache se
                divergir, e limpa o cache quando quem entra é outra pessoa
```

A divisão entre `app/`, `components/`, `domain/` e `utils/` segue uma regra só, e é o que
responde "onde eu ponho este arquivo novo?": **`utils/` não conhece o negócio, `domain/` não
conhece o DOM, `components/` não conhece a tela em que está, `views/` conhece as duas coisas, e
`app/` segura tudo junto.** Até set/2026 existia uma pasta `core/` única com 35 arquivos
misturando as cinco categorias -- ver
[ADR-0005](adr/0005-organizacao-do-client-por-responsabilidade.md).

Cada `View` é instanciada uma única vez (não recriada ao trocar de aba), para não perder o que o
usuário estava digitando. Toda vez que a aba fica visível, `App.js` chama `view.refresh()`, que
usa **stale-while-revalidate** (`app/SwrCache.js`): o que já foi buscado aparece na hora, a
revalidação roda em segundo plano, e a tela só é redesenhada se a resposta for diferente
(comparação por serialização estável — `JSON.stringify` puro não serve porque o SQLite não
garante ordem de colunas entre consultas). Escrita numa aba invalida o cache das outras que
dependem do mesmo dado.

O estado da navegação vive na URL (`#/clientes`, via `app/router.js`): recarregar mantém a tela
aberta, e dá para compartilhar o link de uma aba específica.

Toda tela nova deve estender `app/View.js` e usar `this.on(alvo, evento, fn)` em vez de
`addEventListener` direto quando o alvo é `document`/`window` — listeners registrados assim são
removidos no `destroy()` (sem isso, já causou uma tela fantasma reagindo à tecla `Delete` depois
de um novo login).

**Por que sem framework:** decisão deliberada do projeto — front-end em JavaScript puro, orientado
a objetos, sem etapa de build. Cada `View` segue o mesmo papel que tinha em `gestor/views/*.py` no
app Tkinter original, só desenhando HTML/CSS em vez de widgets Tkinter.

### 2.3 Revisão de interface e distribuição — set/2026

Uma revisão ampla do front-end e do módulo de distribuição corrigiu defeitos, introduziu o modelo
de "uma versão no ar por sistema" e deu ao painel do Atualizador automático o acompanhamento que
faltava.

#### Defeitos corrigidos

| # | Defeito | Onde estava | Correção |
|---|---|---|---|
| 1 | Página sem `<h1>` real | `app/App.js` | `<h1>` que muda por aba, junto com `document.title` |
| 2 | Lista de clientes parados **nunca era desenhada** — a API devolvia os dados, a tela usava só `.length` | `views/ResumoView.js` | Tabela ordenável, fundo tingido conforme o atraso, indicador vira botão que rola até ela |
| 3 | **Race condition na busca** — resposta de `"ab"` podia chegar depois da de `"abc"` e sobrescrever a tabela | Todas as telas com busca | `ApiClient` cancela por chave: requisição nova aborta a anterior de mesma chave |
| 4 | **Listeners vazando** — `document.addEventListener("keydown")` nunca removido; após expirar sessão, `Delete` podia excluir por uma tela fantasma | Atualizações, Agendamentos, Clientes | Classe base `View` com `this.on(...)` rastreado e `destroy()` |
| 5 | Publicar versão sem `try/catch` nem trava de botão | `views/DistribuicaoView.js` | Tratamento de erro, botão travado, mensagem do servidor exibida |
| 6 | `Escape` num campo apagava os 8 campos do formulário, sem volta | Formulários | Limpa e oferece **Restaurar** num toast |
| 7 | `Enter` amarrado campo a campo, sem `<form>` | Formulários | `<form>` de verdade com `submit` |
| 8 | **Exportar ignorava os filtros** — filtrar 12 registros e receber um `.xlsx` com 4.000 | `AtualizacoesController`/repositório | `exportAll(search, responsavel)` usa as mesmas cláusulas de `list()` |
| 9 | "Último log" de cada agente era `MAX(id)`, não o mais recente por data | `VersaoRepository.agentes()` | `ROW_NUMBER() OVER (PARTITION BY cnpj ORDER BY criado_em DESC, id DESC)` |

**Exclusão reversível em vez de confirmação:** Atualizações e Agendamentos não pedem mais
confirmação para excluir — a ação acontece na hora, e um toast oferece **Desfazer** por 7 segundos.
Confirmação em toda exclusão vira reflexo (a pessoa clica sem ler); custa um clique a mais sempre e
não impede o engano nunca. **Clientes continua pedindo confirmação**, de propósito: um cliente é
referenciado pelo nome em todo o histórico, e "desfazer" recriaria o cadastro com id novo — não é
o mesmo que nunca ter excluído.

#### Distribuição: versão por sistema

**O problema:** o formulário só tinha "Versão" e "Arquivo"; `VersaoService.check()` respondia com
a última publicada **de qualquer sistema**. Na prática, o agente do B_NFe podia baixar e instalar
o pacote do B_Vendas.

**O que mudou:**

- `sistema` é o primeiro campo do formulário de publicação, obrigatório.
- `check()` exige `sistema` — deixar opcional reabriria o comportamento perigoso por descuido.
- **Uma versão no ar por sistema, sempre.** Publicar uma versão nova marca a anterior do mesmo
  sistema como `substituida`, que sai de circulação na hora. O formulário avisa antes qual versão
  vai sair do ar.

**Por que "substituída" e não excluída:** o efeito prático é idêntico (sai do ar imediatamente),
mas o registro permanece — quando algo quebra num cliente, a primeira pergunta é "que versão ele
estava rodando antes?". **Exclusão de verdade existe** (`DELETE /api/versoes/:id`, com o arquivo
junto), mas **não é possível excluir a versão que está no ar** — isso deixaria os agentes daquele
sistema sem nada para baixar, sem aviso.

```
  rascunho ──publicar──> publicada ──(publicar outra do mesmo sistema)──> substituida
     │                       │                                                │
     └────── excluir ────────┼──── excluir (bloqueado) ─────────────────────────┘
                             │                                        excluir OK
                        (só saindo do ar)
```

#### Painel do Atualizador automático

Antes, a tabela mostrava contagens calculadas **no navegador**, sobre os últimos 30 registros —
"total de execuções" na verdade era "quantos dos últimos 30". E a pergunta central não tinha
resposta: **quais clientes ainda não estão na versão que eu publiquei?**

Uma chamada só (`GET /api/versoes/painel`) devolve tudo coerente entre si, com a agregação feita em
SQL sobre a tabela inteira:

- **Indicadores gerais:** agentes monitorados · na versão publicada · ainda desatualizados · com
  erro · sem contato (24h+) · execuções nas 24h.
- **Por agente:** `situacao` (`ok`/`desatualizado`/`erro`/`offline`/`pendente`), última versão
  instalada vs. versão-alvo publicada, horas sem contato, taxa de sucesso histórica, máquina/hwid/
  cidade, contagens reais de sucessos/falhas. Precedência da `situacao`: **offline ganha de tudo**
  (não dá para afirmar nada sobre uma máquina sumida), e **erro ganha de desatualizado**.
- **Filtros** por situação, sistema e busca livre.
- **Atualiza sozinho a cada 30s**, e **pausa quando a aba não está visível** — um painel de
  monitoramento com botão manual só mostra a verdade quando alguém lembra de clicar.

#### Fluidez: cache e renderização

`core/SwrCache.js` + `core/View.js` implementam stale-while-revalidate: mostra o que já tem
guardado na hora, revalida por trás, redesenha só se mudou. Redesenhar uma tabela idêntica custa um
pisca visível e a perda da posição de rolagem, sem ganho nenhum. Uma barra fina no topo indica
revalidação em segundo plano.

Renderização incremental: `SortableTable` reaproveita `<tr>` existentes em vez de reconstruir o
`<tbody>` inteiro a cada seleção; `Pagination` só troca rótulos e `disabled` em vez de refazer
`innerHTML` (que antes derrubava o foco pro `body` a cada página); `Autocomplete` passou de um
listener global por instância (nunca removido) para um único compartilhado com `destroy()`.

Upload com progresso: `postForm` usa `XMLHttpRequest` em vez de `fetch` (só o XHR expõe
`upload.onprogress`) — pacotes têm dezenas de MB. Timeout de 10 min para upload, 15s para o resto.

#### Navegação

Rotas por hash (`#/clientes`) — o hash nunca chega ao servidor, sem risco de conflitar com rota da
API. Paleta de comandos (**Ctrl+K**) busca telas, ações e clientes juntos. **Alt+1**…**Alt+9** vão
direto à aba de mesmo número. **`?`** abre a lista de atalhos. Filtros persistem por aba
(`sessionStorage`).

#### Visual, design system e acessibilidade

CSS consolidado (regras que se sobrescreviam viraram uma definição única por componente); escala
tipográfica de 17 tamanhos ad-hoc reduzida a 7 degraus; breakpoints de 6 para 2 estruturais; **tema
claro** somado a escuro/sistema (as cores calculadas em JS agora leem os tokens em tempo de
execução, em vez de hex copiado que quebraria no tema claro).

Acessibilidade: modal com foco preso e `role="dialog"` (foco padrão em confirmações destrutivas é
**Cancelar**, não a ação); abas com `role="tablist"` e navegação por setas; tabelas com cabeçalhos
`<button>` (`aria-sort`) e linhas navegáveis por teclado; skip link; `prefers-reduced-motion` zera
animações; `aria-live` nos contadores, `role="alert"` nos toasts de erro.

#### Contrato do agente (Worker C#)

> Qualquer agente novo precisa mandar `?sistema=` — é obrigatório desde esta revisão.

```http
GET /api/update/check/{cnpj}?sistema=B_Vendas&versao=2026.08.27
x-agent-token: <AGENT_API_TOKEN>
```

```jsonc
// há atualização
{ "update_available": true, "sistema": "B_Vendas", "version": "2026.09.01",
  "packages": [{ "file": "...", "url": "...", "sha256": "...", "bytes": 50 }],
  "script_url": "", "notes": "Observações da entrega" }

// já está na última
{ "update_available": false, "sistema": "B_Vendas" }
```

Sem `sistema`: `400 { "error": "Informe o sistema no parâmetro 'sistema'." }`. Um agente que cuida
de vários sistemas faz uma chamada por sistema.

```http
POST /api/update/log
x-agent-token: <AGENT_API_TOKEN>
```

```jsonc
{
  "cnpj": "11222333000181",
  "status": "OK",                  // obrigatório: OK|SUCESSO|ATUALIZADO|CONCLUIDO ou ERRO|FALHA
  "sistema": "B_Vendas",           // sem ele, o painel não sabe contra qual versão alvo comparar
  "versao": "2026.09.01",
  "versaoAnterior": "2026.08.27",
  "duracaoMs": 73500,
  "maquina": "CAIXA-01",
  "hwid": "...",
  "detalhes": "Atualizado e serviço reiniciado"
}
```

Campos novos são opcionais (logs antigos continuam aceitos), mas sem `sistema`/`versao` o agente
aparece como "em andamento" em vez de "em dia"/"desatualizado". Aliases em inglês aceitos:
`system`, `version`, `previous_version`, `duration_ms`, `machine`, `details`.

> **Nota de terminologia:** o agente C# atual (ver [seção 3](#3-atualizador-inteligente-de-erp--agente-local-c))
> chama esse mesmo valor de `CODIGO_CLIENTE`, não `cnpj` — o campo nunca validou formato de CNPJ
> de verdade, e o nome do lado do agente foi corrigido para não confundir quem configura um
> cliente novo. O contrato de rede (parâmetro `cnpj` na URL/JSON) não mudou.

#### Migrações de banco desta revisão

Todas idempotentes, rodam a cada boot (`Database._migrate`). `versoes_atualizador` ganhou
`sistema`, `substituido_em`, `substituido_por`, `tamanho_bytes`; `atualizador_logs` ganhou
`sistema`, `versao`, `versao_anterior`, `duracao_ms`, `maquina`; índices
`idx_versoes_sistema`/`idx_atualizador_logs_cnpj`. Um backfill automático deduziu o `sistema` das
7 versões publicadas antes desta revisão, comparando o nome do pacote com os sistemas cadastrados
— versões cujo sistema não pôde ser deduzido aparecem como "Sistema não informado" e **não são
distribuídas** até corrigidas (falhar visível é melhor que falhar calado).

### 2.4 Segurança e dependências

Todas as dependências de produção foram atualizadas para a major mais recente (set/2026), sem
mudança de código além do CSP descrito abaixo:

| Pacote | Antes | Depois |
|---|---|---|
| `express` | 4.19 | **5.2** |
| `bcryptjs` | 2.4 | **3.0** |
| `better-sqlite3` | 11.3 | **13.0** |
| `dotenv` | 16.4 | **17.4** |
| `helmet` | 7.1 | **8.3** |
| `multer` | 2.0 | **2.3** |
| `express-session` | 1.18 | **1.19** |

A migração do `express` fechou a última vulnerabilidade moderada do `npm audit` (`qs`, travada em
`~6.15.1` pelo Express 4). Cada rota foi conferida contra as mudanças do Express 5 antes da
migração (parser de query string, `path-to-regexp`, assinatura de handler de erro) — nenhuma
usava os padrões que mudaram.

O que mudou de fato no código, por causa do endurecimento de CSP feito junto: o script inline de
tema no `<head>` de `client/index.html` foi extraído para `client/js/theme-init.js`, e
`Server.js`/`requireAgent.js` ganharam uma CSP sob medida e comparação de token em tempo
constante.

Deixado de fora de propósito: a vulnerabilidade restante do `npm audit` é em `uuid`, puxada por
`exceljs` — não há versão mais nova do `exceljs` que resolva isso sem downgrade de major.

**`connect-sqlite3` foi evitado deliberadamente** desde o início do projeto: depende de `sqlite3` +
`node-gyp`, cadeia com vulnerabilidades conhecidas nas ferramentas de build. As sessões usam uma
classe própria (`SqliteSessionStore.js`) com a mesma `better-sqlite3` do resto do app.

**`.env.bak` esteve commitado no git** (corrigido em set/2026): a regra do `.gitignore` só cobria
`.env` (nome exato); um `.env.bak` real chegou a ser commitado ("Snapshot antes da migração para
Turso", 18/08/2026). O `SESSION_SECRET` dentro era só o valor de exemplo público — nenhum segredo
real vazou desta vez, mas o próximo `cp .env .env.bak` de alguém teria vazado credenciais de
verdade. Corrigido: `.gitignore` agora ignora `.env.*` (com exceção de `.env.example`), e o arquivo
antigo foi tirado do índice do git (`git rm --cached`).

### 2.5 Como rodar, implantar e operar

**Desenvolvimento** (Node.js 18+):

```powershell
cd web/server
npm install
Copy-Item .env.example .env
npm run dev
```

Abra `http://localhost:3000`. Na primeira vez, o próprio app mostra uma tela para criar a conta de
administrador — não precisa editar arquivo nem rodar comando extra. `npm run dev` reinicia sozinho
a cada alteração (via `nodemon`); para produção, `npm start`.

Para reaproveitar o banco do app desktop: copie o `gestao.db` dele para `web/server/data/` (ou
aponte `DB_PATH` direto pro arquivo original) — o schema é compatível.

**Variáveis de ambiente principais** (`server/.env.example` tem a lista completa):

| Variável | Para que serve |
|---|---|
| `PORT` | Porta do servidor (padrão 3000) |
| `DB_PATH` | Caminho do `gestao.db` |
| `SESSION_SECRET` | Assina o cookie de login — trocar por valor aleatório em produção |
| `SESSION_SECURE` | `true` quando atrás de HTTPS |
| `DISCORD_WEBHOOK_URL` | Opcional — avisa Discord a cada atualização nova e quando um agente fica offline/com erro |
| `ALERTA_AGENTES_INTERVALO_MINUTOS` | Intervalo do alerta proativo (padrão 15) |

**Backup e restauração:** cópia automática do `gestao.db` em `server/data/backups/` a cada início
do servidor (mantém as 10 mais recentes). O botão **Backups** no cabeçalho lista e restaura — a
página recarrega inteira depois, para garantir que nenhuma tela fique com dado antigo.

**Implantação:**

- **Rede local:** `npm start` num PC/servidor que fique ligado; a equipe acessa por
  `http://IP-DA-MÁQUINA:3000`.
- **Pela internet:** proxy reverso (Caddy/Nginx) cuidando do HTTPS na frente, com
  `SESSION_SECURE=true`. Sem HTTPS, o login trafega sem criptografia.

**Como serviço do Windows (recomendado para produção):** `Iniciar Gestor.bat` roda numa janela de
console em primeiro plano — se ela fechar, o processo travar ou a máquina reiniciar, a equipe fica
sem o painel até alguém notar. Para produção, instalar via [NSSM](https://nssm.cc/):

```powershell
# Num PowerShell como Administrador
cd web
.\instalar-servico.ps1
```

Idempotente (reinstala do zero sem duplicar); baixa o NSSM se preciso, para uma instância manual
que já esteja na mesma porta, cria o serviço `GestorAtualizacoes`, com log em `server/logs/`
rotacionado por tamanho. `Get-Service GestorAtualizacoes` / `Restart-Service GestorAtualizacoes` /
`Get-Content server\logs\service-out.log -Tail 50 -Wait`. Para desinstalar:
`.\desinstalar-servico.ps1` (não apaga nada do projeto, só o registro do serviço).

**Duas pendências conhecidas do serviço** (identificadas após instalar de verdade, não impedem o
uso):

- **Roda como `LocalSystem`** — o script não define `ObjectName`; o ideal é uma conta virtual por
  serviço (`NT SERVICE\GestorAtualizacoes`) com permissão NTFS só na pasta do projeto, já que o
  servidor não precisa de privilégio de SYSTEM para nada do que faz.
- **Log rotacionado mas nunca podado** — `AppRotateBytes` evita um arquivo crescer sem limite, mas
  as rotações antigas (`service-out-<timestamp>.log`) se acumulam para sempre; o volume é pequeno
  hoje, mas valeria uma tarefa agendada podando rotações com mais de ~90 dias.

### 2.6 Limitações conhecidas desta versão

- Só dois níveis de permissão (administrador / usuário comum) — sem papéis mais granulares.
- Sem sincronização em tempo real: cada pessoa vê os dados atualizados ao trocar de aba, não
  instantaneamente enquanto outra pessoa edita.
- SQLite com `journal_mode=WAL` aguenta bem uma equipe pequena/média; para uso muito intenso e
  concorrente, a migração natural seria PostgreSQL — não feita nesta versão.
- 32 nomes de cliente em `atualizacoes` ainda não têm cadastro correspondente (48 registros), e
  por isso não aparecem no Resumo nem na Consulta. A triagem é manual por enquanto: não existe
  tela de conciliação que ofereça "vincular ao cliente parecido" ou "cadastrar" — ver
  [2.7](#27-mudanças-de-11092026).
- O cadastro de Clientes não gera o código do cliente: o campo é texto livre e nasce vazio,
  embora o padrão da base seja `C` + 6 dígitos sem exceção em 374 cadastros.

### 2.7 Mudanças de 11/09/2026

Cinco mudanças, das quais duas corrigem defeitos que estavam escondidos nos dados, não no código.

**Relatório de atualização** (aba Atualizações, botão "Gerar Relatório"). Monta o texto do que foi
feito, pronto para colar num chamado, em dois formatos: a atualização selecionada (com a versão
anterior daquele cliente entre parênteses) e o histórico completo do cliente. Não exigiu campo
novo: sai só do que já está em `atualizacoes` e `clientes`, então os registros antigos vindos de
planilha geram relatório igual aos de hoje. Campo vazio não vira linha — quase metade do histórico
não tem responsável preenchido, e uma página de "Por: —" seria pior que um texto mais curto. Os
dois formatos vêm da mesma consulta (o histórico do cliente serve aos dois), então trocar de
formato no modal não vai à rede. Única mudança no backend: `limit=todas` em
`/atualizacoes/recent-by-client/:nome`, que antes travava em 50.

**Padronização de nomes de sistema e de responsável** (`services/normalizacao.js`). O campo
"Sistema" sempre foi texto livre e tinha acumulado **144 grafias para 14 sistemas** — `B_NFE`
(342 ocorrências), `B_importaXML` (301), `B_areadocontador e B_importaXML` (203), `B_vendas`,
`NFCe`, `Sped`. Não era um problema estético: `relatorioPorSistema` compara texto exato, então
**60 dos 370 clientes de B_NFe apareciam como "Nunca atualizado"** só porque alguém tinha digitado
`B_NFE`. O campo Responsável tinha o mesmo defeito em menor escala (`CAMILA`/`Camila`/`cAMILA`/
`camila` eram quatro pessoas para o filtro e para a média de dias do Resumo).

A normalização quebra o texto nos separadores que as pessoas usaram de verdade (vírgula, ponto,
`" e "`, `" - "`) e casa cada pedaço com o catálogo ignorando caixa, acento e pontuação,
consultando um mapa de apelidos para o que não casa por semelhança. Responsável segue a mesma
ideia, mas **sem lista fixa de pessoas**: canoniza contra as grafias que já existem, então quem
entrar na equipe amanhã é canonizado pela primeira grafia gravada. Roda no cadastro, na edição e
**na importação de planilha** — normalizar só na tela deixaria a próxima importação desfazer a
faxina. Um nome que não casa com nada é mantido intacto de propósito: inventar destino para o
desconhecido estragaria em silêncio a primeira atualização de um sistema novo.

O histórico já gravado foi acertado por `scripts/normalizar-historico.js`, com as mesmas funções
(simulação por padrão, `--aplicar` numa transação só). Resultado medido: 650 atualizações com
sistema reescrito, 36 com responsável, 1 agendamento; as grafias fora do catálogo caíram de 144
(1.164 ocorrências) para 6 (10 ocorrências), todas as seis deliberadamente ignoradas (`CTe`,
`DFE`, `B_Rat`, `B_Vet`, `B_SYNC`, `B_DFe` — não são sistemas). Cinco sistemas entraram no
catálogo por já aparecerem em atualizações reais: `B_NFCe`, `B_Sped`, `B_Vendas Simples`,
`B_Marques` e `B_Marivet`.

**Arquivamento automático de agendamentos concluídos.** Tarefa concluída há mais de
`AGENDAMENTO_ARQUIVAR_DIAS` (30, no `.env`) sai da lista sozinha. A varredura roda junto da
listagem, **sem agendador**: o app não tem um, um cron só para isto seria mais peça do que o
problema pede, e um `UPDATE` cujo `WHERE` quase nunca casa, numa tabela de dezenas de linhas, roda
exatamente quando alguém está olhando a lista. Coluna `arquivado_em`, **não** `DELETE`: a tarefa
arquivada continua contando no tempo médio de resolução por responsável do Resumo — apagar a linha
limparia a tela e estragaria a métrica no mesmo gesto. O filtro de Status ganhou "Arquivadas" (com
a contagem no rótulo) e um botão "Reabrir". Desarquivar **reabre** de propósito: como a varredura
roda a cada listagem, uma tarefa que só saísse do arquivo continuando "Concluído" seria arquivada
de novo no mesmo segundo. Só arquiva quem tem `concluido_em` preenchido — tarefas concluídas antes
daquela coluna existir não têm como saber há quanto tempo, e sumir por um prazo incalculável seria
arquivar no escuro.

**Preferências passam a ser da conta** (`usuario_preferencias`, `GET`/`PUT /api/preferencias`).
Detalhado em [2.2](#22-arquitetura-do-código). Em resumo: viviam só no `localStorage`, e o efeito
aparecia na hora errada — trocar de máquina ou de navegador devolvia o app aos padrões, e num
computador compartilhado as escolhas de uma pessoa recebiam a seguinte. O `localStorage` continua
sendo escrito como **cache**, porque `theme-init.js` roda no `<head>` e precisa de resposta
síncrona; esperar uma requisição ali faria a página nascer no tema errado. Migração é invisível: a
conta que entra sem nada salvo no servidor sobe o que estava no navegador. O aviso de falhas por
notificação não acompanha a conta — depende de permissão concedida por aparelho.

**Limpeza do cadastro de clientes.** Uma comparação da tabela `clientes` (373 linhas) contra a
lista mantida fora do sistema (374) mostrou o cadastro praticamente idêntico: 1 faltando, 0
sobrando, 0 nomes divergentes, 0 cidades divergentes. O problema real estava do outro lado — **38
nomes de cliente apareciam em `atualizacoes` sem cadastro correspondente**, e esses 57 registros
não apareciam no Resumo nem na Consulta. Foram resolvidos 6: três clientes cancelados tiveram suas
5 atualizações apagadas, um ex-cliente teve a sua apagada, um cliente que estava na lista externa
mas não no cadastro foi criado (com o próximo código da sequência `C` + 6 dígitos) e as duas
atualizações que traziam o nome dele sem o sufixo "LTDA" foram vinculadas a esse cadastro. Restam **32 órfãos / 48 registros**, pendentes de triagem. Toda a limpeza está
registrada na aba Histórico sob o autor "limpeza de cadastro".

### 2.8 Mudanças de 15/09/2026

Três mudanças pequenas.

**Botão "Arquivar" manual em Agendamentos**, ao lado de "Excluir Selecionada". Até aqui uma tarefa
só saía da lista pela varredura automática ([2.7](#27-mudanças-de-11092026)) — quem queria tirar
uma tarefa já concluída da vista sem esperar `AGENDAMENTO_ARQUIVAR_DIAS` não tinha como. Novo
endpoint `PATCH /agendamentos/:id/arquivar`, restrito a tarefas "Concluído" (mesma regra da
varredura): arquivar uma tarefa ainda pendente faria "Reabrir" resetar o status dela para "A Fazer"
sem necessidade, já que reabrir sempre volta ao primeiro status da lista.

**Gráfico de "Tendência Mensal de Atualizações" (Resumo) virou linha, não mais barras
horizontais.** Usava o mesmo componente `BarChart` do gráfico "Por Sistema" — bom para comparar
categorias, ruim para ler evolução no tempo, porque barra horizontal não tem um eixo
esquerda→direita representando o tempo. Novo componente `core/LineChart.js` (SVG puro, sem
biblioteca): linha suavizada (Catmull-Rom convertido para Bézier cúbica, não segmentos retos
ponto-a-ponto), área com gradiente — forte perto da linha, sumindo perto da base, o que continua
legível mesmo com a cor de destaque "Grafite" (dessaturada) —, halo atrás do ponto mais recente, e
crosshair + tooltip ao passar o mouse. Os rótulos do eixo X são escolhidos por **posição** (no
máximo 6, sempre incluindo o primeiro e o último mês) em vez de "um a cada N": a primeira versão
pulava de 2 em 2 mas forçava o último mês a aparecer sempre, o que deixava os dois últimos rótulos
colados quando `n-1` não caía num índice múltiplo do passo — e um mês inteiro (julho/2026, no caso)
sumia sem que nada tomasse o lugar dele.

**Relatório de uma atualização (botão "Gerar Relatório") não mostra mais código nem cidade do
cliente** — só o nome, como está gravado em `atualizacoes.cliente`. O relatório do histórico
COMPLETO do cliente (o outro formato do mesmo modal) não mudou e continua mostrando a cidade.

---

### 2.9 Revisão de interface e Configurações — 15/09/2026

Uma segunda leva do mesmo dia, toda no cliente web. Nenhuma rota nova no servidor: as
preferências já aceitam qualquer chave (`PreferenciaService`, ver [2.7](#27-mudanças-de-11092026)),
então uma opção nova passou a acompanhar a conta sem tocar no backend.

**Casca: cabeçalho grudado, busca visível, menu da conta.** O `.app-header` virou
`position: sticky` com fundo translúcido e desfoque; ao sair do topo ele ganha sombra e encolhe o
respiro (classe `is-grudado`). Quem decide isso é um `IntersectionObserver` sobre um pixel
invisível colocado antes do cabeçalho, e não um listener de `scroll`: o listener roda a cada quadro
de rolagem de uma tabela de duzentas linhas para descobrir um booleano que muda duas vezes no dia.
O botão de busca (`.app-header__search`) tinha CSS escrito — inclusive o que ele vira no tablet —
para um elemento que nunca era criado; agora existe, e abre a paleta de comandos mostrando o
`Ctrl + K` que antes não aparecia em lugar nenhum. O canto direito, que tinha um bloco de texto
inerte e dois ícones sem rótulo (um deles encerrando a sessão de quem errasse o alvo por seis
pixels), virou `core/MenuConta.js`: avatar com iniciais, tema em três opções escritas por extenso,
"Atualizar os dados desta tela", Configurações (com `Ctrl + ,` ao lado), Atalhos e Sair.

**`App.recarregarAba()`.** O `SwrCache` torna a troca de aba instantânea e, em troca, não havia
como dizer "esqueça o que você guardou e pergunte de novo" — só recarregando a página, que cobra o
login, a rolagem e a aba aberta. O método invalida o cache e redesenha a aba atual; `_mostrarAba`
passou a devolver a promessa do `refresh()` para o aviso de "Dados atualizados" só aparecer quando
a busca de fato terminar. A troca de tema e a mudança de "linhas por página", que faziam isso na
mão em dois lugares, agora chamam o mesmo método.

**Preferências: um mapa de padrões no lugar de duas listas.** `core/appearance.js` tinha sete
constantes `PADRAO_*` mais uma lista `CHAVES` escrita à mão para o "Restaurar padrões" — duas
listas para a mesma coisa, sendo a segunda o lugar clássico de esquecer a preferência nova (e o
esquecimento só apareceria no dia em que alguém restaurasse os padrões). Um `PADROES` único agora
responde quatro perguntas: qual é o padrão de X, quais são todas as chaves, o que o usuário já
mexeu (`diferencas()`, que alimenta os selos "alterado") e o que sai num arquivo de exportação.
Sobre ele vieram `PERFIS` (Equilibrado, Operação, Leitura, Alto contraste), `perfilAtivo()` — que
compara o estado inteiro, não "qual foi o último clicado", porque quem aplica um perfil e depois
aumenta o texto não está mais nele — e `exportar()`/`importar()`, com uma tabela `VALIDOS` por
chave: importar é o único caminho pelo qual um valor chega sem ter passado por um controle da tela.

**Painel de Configurações.** Seis seções (entrou **Acessibilidade**), selo "alterado" por linha,
contagem por seção, resumo no rodapé e "Restaurar esta seção" — o botão de restaurar era tudo ou
nada. Cada item da lista de definições declara de quais chaves é dono (`chaves: [...]`), o que
mantém selos, contagens e restauração por seção lendo a mesma fonte que já alimentava o desenho, a
trilha e a busca. Mudanças em lote (perfil, importação, restauração) deixaram de fazer
`location.reload()`: `_aplicarEmLote()` repinta tema e aparência, pede ao `App` que alinhe o que é
dele (menu lateral e dados da aba, via `aoMudarVarias`) e remonta os controles do painel, que
continua aberto. Com o reload fora, `salvarPreferenciasAgora()` — que existia só para o envio
agrupado não ser morto no meio pelo reload — saiu do `prefs.js`.

**Três preferências novas, todas como atributo no `<html>` + tokens no CSS.** `data-contraste="alto"`
é escrito **uma vez só**, derivando cada token do próprio tema com `color-mix` (texto misturado com
o fundo): no escuro o texto é claro sobre fundo escuro, no claro é o contrário, e a mesma conta
empurra os dois na direção de mais contraste — sem exigir um bloco por tema como o `[data-realce]`
precisou. `data-transparencia="reduzida"` desliga o `backdrop-filter` da barra lateral, do
cabeçalho, dos modais e da paleta, e troca os véus por cor cheia. `data-zebra="nao"` apaga a listra
mexendo no token `--veu-linha`, e não num seletor que desfaça o `background` da linha ímpar: um
seletor com `:root[...]` na frente ganharia também das linhas de severidade e de atraso, que
precisam continuar pintadas. Contraste e transparência entraram também no `theme-init.js` (no
`<head>`), pelo mesmo motivo do tema: redefinem cor, e cor aplicada tarde é o que se vê piscar.

**Login.** Botão de mostrar a senha e aviso de Caps Lock. O aviso escuta `keyup` além de `keydown`
porque o estado da tecla só muda depois de ela subir — sem isso o aviso ficaria um caractere
atrasado, sumindo justamente quando a pessoa desliga a tecla para consertar.

**Aviso de conexão perdida.** O `ApiClient` passou a distinguir "o servidor respondeu" (mesmo com
4xx: quem está fora do ar não recusa nada, não responde) de "não deu para falar com ele" — status 0
e timeout —, e dispara `conexao:mudou` no `document` **só na troca de estado**. `core/ConexaoBanner.js`
escuta, põe uma faixa fixa no topo enquanto durar, tenta `/auth/status` a cada 5s e some quando o
servidor volta, chamando `recarregarAba()` na saída. Quem apaga a faixa não é o `_tentar()`: é o
próprio evento do `ApiClient`, para haver um caminho só para "voltou" — vale também quando quem
descobriu foi outra chamada qualquer feita no meio tempo. A faixa fica em `z-index: 1050`, abaixo
dos modais (1100): uma confirmação aberta continua sendo a coisa mais urgente da tela. Enquanto ela
existe, cabeçalho e barra lateral descem 44px (`body:has(.conexao-aviso)`), em vez de o conteúdo
inteiro ser empurrado — o que faria a página saltar na queda e de novo na volta.

**Lembretes no título da aba** (`(2) Clientes · Gestor de Atualizações`). O app vive numa aba de
fundo boa parte do dia; a faixa de lembretes só alcança quem está olhando a tela, e o título é a
única parte dele que aparece na barra de tarefas do Windows. `_atualizarTitulo()` passou a ser o
único lugar que escreve `document.title`, chamado na troca de aba e quando os lembretes chegam.

**A faixa de conexão também escuta o `offline` do navegador**, que chega na hora em que o cabo sai,
sem esperar requisição nenhuma falhar. O primeiro desenho disso tinha um bug que o teste pegou: a
faixa se mostrava sozinha nesse evento, o `ApiClient` continuava se achando online, e por isso a
primeira resposta boa depois da volta não era uma TROCA de estado — não disparava `conexao:mudou`, e
a faixa ficava na tela para sempre sobre um app que já funcionava. O estado ficou com um dono só:
quem descobre a queda chama `api.marcarOffline()`; quem apaga a faixa continua sendo a resposta do
servidor.

**Densidade e contraste também na paleta de comandos**, por serem os dois ajustes que se liga e
desliga várias vezes ao dia; os outros dezesseis seguem só em Configurações.

**Atalhos e avisos.** `Ctrl + B` alterna a barra lateral pelo mesmo `_definirSidebar` que o painel
de Configurações usa (uma preferência, um caminho), e cada aba passou a mostrar seu `Alt+N` num
`<kbd>` que ocupa o espaço o tempo todo e só muda de opacidade — aparecer do nada empurraria o
rótulo e mudaria a largura da aba debaixo do cursor. No `Toast`, a duração original passou a ser
guardada na entrada ativa: `mouseleave` reagendava a saída com `DURACAO_MS`, encurtando a janela do
toast de "Desfazer" (`DURACAO_ACAO_MS`) justamente para quem levou o mouse até ele; `focusin`/
`focusout` entraram pelo mesmo motivo, já que o botão "Desfazer" é alcançável por Tab.

**Dois arquivos novos de apoio**, os dois para não duplicar regra: `core/pessoa.js` (iniciais do
avatar e nome do papel, usados pelo menu e pelo painel, que não deviam depender um do outro) e
`core/arquivo.js` (`baixarBlob`/`escolherArquivo`; o `downloadBlob` que vivia solto dentro de
`AtualizacoesView` mudou de casa e passou a ser usado também pela exportação de preferências).

**Conferência.** A revisão foi verificada com o Chrome em modo headless dirigido por CDP contra uma
instância de teste (porta 3100, banco vazio): criação da conta inicial, login, menu da conta,
painel em todas as seções, aplicação de perfil, restauração por seção, busca do painel, ciclo
exportar→importar (inclusive com valores inválidos, que são ignorados), contraste alto, superfícies
sólidas, zebra desligada, `Ctrl + ,`, cabeçalho grudando e soltando na rolagem, e os dois temas.
Nenhum erro de console em nenhum dos passos. O bug encontrado no caminho foi meu: uma crase dentro
de um comentário HTML **dentro de um template literal** fecha a string — `node --check` passava e o
navegador recusava o módulo inteiro, deixando a página em branco.

---

## 3. Atualizador Inteligente de ERP — agente local (C#)

> **Estado: pré-piloto.** Compila, o fluxo principal está implementado, os bugs críticos
> conhecidos foram corrigidos, o formato gravado em `BEXE.fdb` foi confirmado campo a campo contra
> um arquivo real correto, e o ciclo completo (Fase 1 → Fase 3 → Fase 4, com Fase 2 simulada) já
> rodou de ponta a ponta várias vezes contra Firebird real. **Ainda não deve rodar em cliente
> real:** falta a Fase 2 (autorização pelo ERP Delphi) e triagem dos scripts antigos aplicados fora
> do controle da tabela `SCRIPTS`. Detalhe completo em `atualizador/RISCOS-CONHECIDOS.md`.

### 3.1 Visão geral e objetivo

O agente é um `BackgroundService` (.NET 8) que roda dentro da pasta do cliente, no mesmo servidor
onde já ficam `JUNIOR.fdb`, `BEXE.fdb` e os executáveis do ERP. Ele consulta a API central (o
painel web da seção 2), baixa e valida os pacotes da versão nova, espera a autorização do usuário
(dada pelo próprio ERP Delphi), isola o banco Firebird, aplica os scripts, distribui os
executáveis novos e devolve o banco ao ar — sem que ninguém precise entrar remotamente no servidor
do cliente.

### 3.2 Como funciona — máquina de estados

O agente faz polling e reage ao campo `STATUS` da tabela `SYS_ATUALIZACAO`, no `JUNIOR.fdb` do
cliente:

| Estado | Significado | Quem grava |
|---|---|---|
| `CONCLUIDO` / `ERRO` | Ocioso — livre para procurar versão nova | Agente |
| `PENDENTE` | Pacote baixado, esperando o usuário autorizar | Agente |
| `AUTORIZADO` | Usuário confirmou; pode executar | **ERP Delphi** |
| `PROCESSANDO` | Execução crítica em andamento | Agente |

**Fase 1 — Preparo invisível.** Consulta a API com o código do cliente e a versão atual; se houver
versão nova, baixa os pacotes, confere o **SHA-256** de cada um, extrai com `7za.exe` e grava
`PENDENTE`.

**Fase 2 — Decisão do usuário.** **Não implementada neste repositório.** Cabe ao ERP Delphi ler
`PENDENTE`, perguntar ao usuário e gravar `AUTORIZADO`. Sem isso o ciclo trava aqui — nos testes
registrados, essa fase é simulada gravando `AUTORIZADO` direto no banco via `isql`.

**Fase 3 — Execução crítica.** `gfix -shut multi -force 0` (isola o banco mantendo acesso SYSDBA)
→ `gbak` (backup pré) → `ScriptRunnerService` (aplica cada `.sql` pendente do pacote, um processo
`isql` isolado por arquivo) → injeção dos binários no `BEXE.fdb` → `gfix -online` → `gbak` (backup
pós, já com o banco de volta ao ar).

**Fase 4 — Distribuição.** Grava os executáveis novos como BLOB na tabela `EXECUTAVEIS` do
`BEXE.fdb` (transação única), marca `CONCLUIDO` e reporta à API. Os terminais leem o `BEXE.fdb` e
se atualizam sozinhos. Só os `.exe` soltos na **raiz** do pacote entram nessa injeção — dependências
em subpastas (ex.: `openssl.exe` usado internamente pelo ERP) ficam de fora, ver
[3.8](#38-histórico-de-correções-críticas).

Qualquer exceção na Fase 3/4 dispara o `catch`: tenta restaurar o backup pré com
`gbak -c -replace_database`, força o banco de volta ao ar, grava `ERRO` com a mensagem em
`MENSAGEM_LOG` e reverte `VERSAO_NOVA` para a versão anterior.

### 3.3 Onde o agente mora

Instalado **dentro da própria pasta do cliente**, numa subpasta própria, para não espalhar
`.dll`/`.pdb`/`7za.exe`/backups no meio dos arquivos do cliente:

```
Bredas\                     <- pasta do cliente (já existe hoje)
  JUNIOR.fdb
  BEXE.fdb
  B_Vendas.exe, ...
  Atualizador\               <- pasta do agente
    AtualizadorERP.exe
    7za.exe
    atualizador.ini          <- configuração deste cliente (não versionado)
    _trabalho\                <- descartável, recriada a cada ciclo
      pacotes\                 <- downloads + extração da versão em andamento
    Backups\                  <- PERSISTENTE, nunca apagada pela limpeza automática
      JUNIOR_PRE_9.9.9_20260903_114500.fbk
      JUNIOR_POS_9.9.9_20260903_114500.fbk
```

Por padrão, `JUNIOR.fdb`/`BEXE.fdb` são resolvidos como `..\JUNIOR.FDB`/`..\BEXE.FDB` a partir da
pasta do agente (um nível acima). `_trabalho\pacotes\` é a **única** pasta que a Fase 4 varre atrás
de `.exe` para injetar — qualquer executável que caia ali só é considerado se estiver solto direto
nela, não em subpastas. `Backups\` nunca é tocada pela limpeza automática; se poda sozinha,
mantendo os últimos `BACKUPS_PARA_MANTER` ciclos (padrão 10).

### 3.4 Estado atual: pré-piloto

O que já foi validado contra Firebird real, com testes registrados:

- Ciclo completo (Fase 1 → Fase 3 → Fase 4, Fase 2 simulada) rodando **através da API real**
  (não cópia manual de pacote), pacote publicado real do B_Vendas, como serviço Windows
  instalado — concluído em 70 segundos.
- Rollback (`gfix -shut` → `gbak -b` → `gbak -c -replace_database` → `gfix -online`) testado de
  ponta a ponta contra banco real.
- 2302 scripts reais de `Scripts-BVendas/` (2011–2026) testados contra uma cópia de produção de
  366 tabelas: 201 pendentes aplicaram limpo; entre 43 e 69 (dependendo do estado prévio do banco)
  falham por deriva de schema legado e exigem triagem manual — não é bug do agente, é histórico
  anterior ao controle automático.
- 25 testes de integração automatizados (`AtualizadorERP.Tests/`), contra Firebird real, cobrindo
  `ProcessService`, `DatabaseService`, `ScriptRunnerService` e o ciclo completo do `Worker`.

**O que falta antes de qualquer piloto real:**

- **Fase 2 (Delphi) não existe.** Nenhum arquivo `.pas`/`.dpr` no repositório — ler `PENDENTE`,
  perguntar ao usuário e gravar `AUTORIZADO` ainda precisa ser escrito no ERP.
- **Idempotência dos scripts antigos** — mitigada (o agente nunca reaplica o que já está
  registrado em `SCRIPTS`, e uma verificação prévia cobre boa parte do que foi aplicado antes de
  existir esse controle), mas não é 100%: uma fração dos 2302 scripts reais segue precisando de
  triagem manual.
- **Convenção de `NOMEPRODUTO`** — a injeção usa o nome do arquivo sem extensão; confirmado que
  funciona para `B_Vendas.exe`, mas não há confirmação de que os terminais realmente leem esse
  campo (em vez de `NOMEARQUIVO`) para decidir o que baixar.
- Testes automatizados ainda não cobrem a Fase 1 completa contra a API real nem os ~2300 scripts
  reais de produção (a suíte usa scripts sintéticos pequenos) — vale repetir o ciclo manual contra
  cópias descartáveis antes de qualquer mudança maior futura no `Worker.cs`/`DatabaseService.cs`.

### 3.5 Requisitos e instalação

- **.NET 8 SDK** só na máquina que compila — o executável é publicado *self-contained +
  single-file*: todo o runtime .NET e as DLLs de dependência (driver Firebird,
  `Microsoft.Extensions.*`) ficam embutidos no próprio `AtualizadorERP.exe`. O servidor do cliente
  **não precisa** ter .NET instalado.
- **Firebird 2.5** no servidor do cliente, com `gfix.exe`, `gbak.exe` e `isql.exe`.
- **`7za.exe`** ao lado do executável — o pacote gerado pelo CI (GitHub Actions) já inclui essa
  cópia automaticamente.
- Acesso de leitura/escrita ao `JUNIOR.fdb` e ao `BEXE.fdb`.

**Publicar** (o mesmo comando que o CI usa a cada push):

```bash
dotnet build AtualizadorERP.csproj
dotnet publish AtualizadorERP.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o ./Atualizador
```

Produz 3 arquivos: `AtualizadorERP.exe` (~70 MB, tudo embutido), `AtualizadorERP.pdb` e
`atualizador.ini.example`. Copie `7za.exe` também (dispensável se usar o artefato do GitHub
Actions, que já vem completo). Copie a pasta inteira para dentro da pasta do cliente, renomeie
`atualizador.ini.example` para `atualizador.ini`, preencha e registre o serviço:

```powershell
sc.exe create "AgenteAtualizadorERP" binPath= "C:\caminho\ate\Bredas\Atualizador\AtualizadorERP.exe" start= auto
sc.exe start "AgenteAtualizadorERP"
```

### 3.6 Configuração (`atualizador.ini`)

Tudo vem de um `.ini` ao lado do executável — nenhuma credencial embutida no código. Um `.ini` foi
escolhido em vez de variável de ambiente porque configurar variável de ambiente de um *serviço
Windows* exige elevar e editar o registro — inviável para instalar em dezenas de clientes em
campo. Um `.ini` abre no Bloco de Notas.

| Chave | Padrão | Obrigatória |
|---|---|:-:|
| `CODIGO_CLIENTE` | — | **sim** |
| `SISTEMA` | — | **sim** |
| `API_TOKEN` | — | **sim** |
| `DB_PASSWORD` | — | **sim** |
| `API_URL` | `http://localhost:3000/api` | |
| `DB_USER` | `SYSDBA` | |
| `DB_PORT` | `3050` | |
| `JUNIOR_FDB` | `..\JUNIOR.FDB` (relativo à pasta do agente) | |
| `BEXE_FDB` | `..\BEXE.FDB` (relativo à pasta do agente) | |
| `GFIX_PATH` / `GBAK_PATH` / `ISQL_PATH` | `...\Firebird_2_5\bin\{ferramenta}.exe` | |
| `PASTA_TRABALHO` | `_trabalho` | |
| `PASTA_BACKUPS` | `Backups` | |
| `BACKUPS_PARA_MANTER` | `10` | |

Faltando qualquer obrigatória, o agente falha ao subir de propósito, para não rodar meio
configurado. `atualizador.ini` nunca deve ser commitado (tem credencial real) — já coberto pelo
`.gitignore` (`*.ini`); só o `.example`, sem segredo, fica versionado.

`API_TOKEN` precisa bater com `AGENT_API_TOKEN` do servidor. `CODIGO_CLIENTE` não precisa ser CNPJ
de verdade — é um identificador livre; recomendado usar o `codigo` já cadastrado na aba
**Clientes** do painel (ex.: `C012345`), que o painel casa automaticamente com o cliente. `SISTEMA`
precisa bater, letra por letra, com um sistema cadastrado na aba **Sistemas** — uma máquina que
roda mais de um sistema precisa de uma instância do serviço por sistema.

> A porta `3050` é o padrão do Firebird, mas ambientes reais usam outras — um `BScript.Ini` de
> produção real inspecionado usava `3051`. Confira antes de instalar num cliente novo.

### 3.7 Contrato com a API central

Todas as chamadas mandam o header `X-Agent-Token`.

```http
GET {API_URL}/update/check/{cnpj}?versao={versaoAtual}
```

```json
{
  "update_available": true,
  "version": "2026.08.10",
  "packages": [
    { "file": "pacote.7z", "url": "https://.../api/update/packages/pacote.7z", "sha256": "abc123..." }
  ],
  "script_url": "https://.../BScript.exe"
}
```

`script_url` ainda existe no contrato por compatibilidade, mas **o agente não lê mais esse
campo** — a Fase 3 aplica os `.sql` do próprio pacote via `ScriptRunnerService`, não um binário
externo (ver [3.8](#38-histórico-de-correções-críticas)).

```http
POST {API_URL}/update/log
```
`{ "cnpj": "...", "status": "SUCESSO|ERRO", "detalhes": "..." }` — best-effort: falha de rede aqui
não interrompe o ciclo.

### 3.8 Formato gravado em `EXECUTAVEIS` (`BEXE.fdb`)

Confirmado campo a campo contra um `BEXE.fdb` real e correto (03/09/2026) — divergir de qualquer
um destes formatos faz o atualizador interno dos terminais não reconhecer a linha:

| Campo | Formato |
|---|---|
| `NOMEARQUIVO` | Caminho **completo** no disco do cliente (ex.: `D:\Bredas\B_Vendas.exe`) — a pasta usada é a do `BEXE.fdb`, não a do agente. Também é a chave de `UPDATE` vs `INSERT`. |
| `HASHEXE` | SHA-1 em **hexadecimal maiúsculo** (40 caracteres) — não SHA-256. |
| `VERSAO` | A versão **embutida no próprio executável** (`FileVersion`, ex.: `26.9.1.8`), não a versão do pacote publicada no painel. |
| `VERSAOATUALIZADA` | Um **flag de texto** (`"True"`/`"False"`), não uma versão — a coluna real só cabe 5 caracteres. O agente só grava `"True"`; reverter para `"False"` é responsabilidade de outra parte do sistema, fora deste repositório. |
| `EXECUTAVEL` | BLOB com o conteúdo binário completo do `.exe`. |
| `DATA_ATUALIZACAO` | Data (sem hora) da injeção. |

### 3.9 Histórico de correções críticas

Linha do tempo resumida dos achados de maior impacto, a partir de leitura de código, engenharia
reversa dos binários reais (`BScript.exe`, `BEXE.FDB`, `BScript.Ini`) e dos primeiros testes de
ponta a ponta. Detalhe completo, com trecho de código e cenário de falha de cada item, em
`atualizador/RISCOS-CONHECIDOS.md`.

| Data | Achado | Correção |
|---|---|---|
| 28/08 | `BScript.exe` baixado via `script_url` era distribuído aos terminais como se fosse atualização do ERP | `TEMP_PATH` dividido: só `pacotes\` é varrida pela Fase 4 |
| 28/08 | Rollback podia restaurar um backup de dias atrás (arquivo antigo não apagado) | `preBkp` apagado no início do ciclo; flag `backupValido` só liga após `gbak` ter sucesso |
| 31/08 | **`BScript.exe` real não tem modo silencioso** — confirmado por dois testes reais: `/silent` é ignorado, a janela do Delphi/FireDAC abre e trava esperando clique | **Substituído por `Services/ScriptRunnerService.cs`**: aplica cada `.sql` via `isql` isolado por processo, reaproveitando a tabela `SCRIPTS` que o `BScript.exe` já mantinha (compatível com o histórico gravado manualmente) |
| 31/08 | Backoff quase nunca entrava em ação (contador zerava antes de crescer) | Só zera quando o ciclo anterior estava `CONCLUIDO`, não em qualquer sucesso de polling |
| 31/08 | "Sucesso" registrado mesmo sem nenhum `.exe` extraído | `InjetarNovosBinarios` lança erro se a lista vier vazia |
| 31/08 | Reversão de `VERSAO_NOVA` dependia de um `.txt` solto que podia sumir | Nova coluna `VERSAO_ATUAL`, separada de `VERSAO_NOVA` — só avança após sucesso real; nada para "reverter" se falhar antes |
| 31/08 | Senha do Firebird exposta na linha de comando (visível via Gerenciador de Tarefas/WMI) | Credenciais via `ISC_USER`/`ISC_PASSWORD` no ambiente do processo, não mais como argumento |
| 31/08 | API fora do ar (401, DNS morto) contava como "sem atualização" e zerava o backoff | Exceção sobe até o `catch` do `Worker`, entra no mesmo backoff de falha de atualização |
| 31/08 | Backup pós-atualização rodava **dentro** da janela de shutdown, somando até 15 min de indisponibilidade | Roda depois do `gfix -online`, com o banco já servindo os terminais |
| 31/08 | Downloads com timeout fixo de 100s (padrão do .NET) | `HttpClient` sem timeout fixo; cancelamento via `CancellationToken` propagado |
| 31/08 | `-shut force_0` nunca foi sintaxe válida do `gfix` (testado: erro "Target shutdown mode is invalid") | `-shut multi -force 0` — "multi" isola terminais mantendo acesso SYSDBA (testado que "full" bloqueia até o SYSDBA) |
| 31/08 | `gfix`/`gbak` com caminho puro podiam resolver para a instância errada do Firebird (máquina com 2.0 e 2.5 instalados) | Todas as chamadas usam `localhost/{porta}:{caminho}` explícito |
| 31/08 | Connection pooling do driver .NET quebrava depois de um `gfix -shut` (conexão em cache ficava inválida) | `Pooling=false` na connection string |
| 01/09 | `SYS_ATUALIZACAO` **não existe** no `JUNIOR.fdb` real de produção (366 tabelas inspecionadas) — era só assumida pelo projeto | `GarantirTabelaSysAtualizacao` cria a tabela no primeiro ciclo se não existir (idempotente) |
| 03/09 | `openssl.exe` (dependência interna do B_Vendas, numa subpasta do pacote) era injetado como se fosse um produto novo | Varredura da Fase 4 restrita a `.exe` soltos na **raiz** do pacote |
| 03/09 | 4 dos 6 campos de `EXECUTAVEIS` gravados em formato errado (nome sem caminho completo, SHA-256 em vez de SHA-1, versão do pacote em vez do `FileVersion`, etc.) — achado comparando campo a campo contra um `BEXE.fdb` real e correto | `InjetarNovosBinarios` reescrito contra o formato confirmado (ver [3.8](#38-histórico-de-correções-críticas)) |
| 03/09 | Configurar o serviço via variável de ambiente exigia elevar e editar o registro do Windows — inviável para instalar em campo | Configuração inteira migrada para `atualizador.ini` (ver [3.6](#36-configuração-atualizadorini)) |
| 03/09 | Backups pré/pós eram apagados no mesmo ciclo em que nasciam (`Directory.Delete` da pasta de trabalho) | `Worker.ArquivarBackups` move os dois para `PASTA_BACKUPS`, fora da limpeza automática; poda mantém as últimas 10 gerações |

**Todas as correções acima passam pelo `ProcessService`, que exige timeout obrigatório em toda
chamada a processo externo** — não é estilo, é segurança: a Fase 3 roda com o banco em
`-shut force_0`/`multi -force 0` (bloqueado para todos os usuários), então um processo que trava
sem timeout deixaria o cliente inteiro parado até alguém perceber.

---

## 4. Decisões de arquitetura — ADRs do painel web

> Esta seção reúne os Registros de Decisão de Arquitetura (ADR) que antes existiam como arquivos
> separados em `web/docs/adr/`. Incorporados aqui em 22/09/2026 — ver
> [seção 7](#7-histórico-deste-documento-o-que-foi-consolidado). O agente C# (`atualizador/`) tem
> seus próprios ADRs, em `atualizador/docs/adr/` — não fazem parte deste documento.

Um ADR é um documento curto que registra **uma** decisão de arquitetura: o que foi decidido, em
que contexto, o que se ganhou e o que se perdeu. Existem porque o código mostra o resultado de uma
decisão, nunca as alternativas que foram descartadas. Sem isso, meses depois alguém "conserta" uma
escolha deliberada — e reintroduz o problema que ela evitava.

| # | Decisão | Situação |
|---|---|---|
| [4.1](#41-adr-0001--front-end-sem-framework-e-sem-etapa-de-build) | Front-end sem framework e sem etapa de build | Aceita |
| [4.2](#42-adr-0002--sqlite-embarcado-com-driver-síncrono) | SQLite embarcado, com driver síncrono | Aceita |
| [4.3](#43-adr-0003--armazenamento-de-sessão-escrito-à-mão) | Armazenamento de sessão escrito à mão | Aceita |
| [4.4](#44-adr-0004--injeção-de-dependência-na-mão-sem-container) | Injeção de dependência na mão, sem container | Aceita |
| [4.5](#45-adr-0005--clientjs-dividido-por-responsabilidade) | `client/js/` dividido por responsabilidade | Aceita |
| [4.6](#46-adr-0006--verificação-de-tipos-sem-etapa-de-build-escopada-ao-código-puro) | Verificação de tipos sem build, escopada ao código puro | Aceita |
| [4.7](#47-adr-0007--piloto-rollback-e-concorrência-otimista) | Piloto, rollback e concorrência otimista | Aceita |

**Como escrever um novo:** copie a estrutura de qualquer um — Contexto → Decisão → Consequências →
Alternativas consideradas — como uma nova subseção `4.N` no fim desta lista. Um ADR não se edita
depois de aceito: se a decisão mudar, escreva um novo que o substitua e marque o antigo como
"Substituída pelo ADR 4.N". Registre uma decisão aqui quando ela for **cara de reverter** ou quando
a escolha óbvia tiver sido descartada por um motivo não óbvio — escolha de nome de variável não é
ADR.

### 4.1 ADR-0001 — Front-end sem framework e sem etapa de build

**Situação:** Aceita

**Contexto.** O painel tem ~15 telas com tabelas, formulários, modais e alguns gráficos. O caminho
padrão da indústria seria React (ou Vue/Svelte) com Vite, resultando em `npm run build` gerando um
bundle. Duas restrições pesaram mais que o padrão: (1) quem mantém é uma equipe pequena, sem
especialista em front-end — o sistema precisa ser corrigível por quem abre o arquivo, vê o erro e
conserta, eventualmente no servidor, às pressas, com o cliente esperando; (2) o ciclo de vida
esperado é longo e de manutenção baixa — um projeto com build parado por dois anos não compila
mais (as versões das ferramentas saíram de baixo), enquanto HTML/CSS/JS servido direto continua
rodando.

**Decisão.** O front-end é HTML, CSS e JavaScript puro, com módulos ES nativos do navegador. O que
está em `client/` é exatamente o que o navegador executa. Sem bundler, sem transpilação, sem
`node_modules` no front-end. Componentização é feita com classes de JavaScript manipulando o DOM
diretamente (`components/`, `views/`), e `ApiClient.js` é o único ponto que fala HTTP.

**Consequências.**

*Ganhos:* depurar no navegador mostra o arquivo real, com os nomes reais, sem source map; nenhuma
dependência de front-end para auditar, atualizar ou quebrar; alterar uma tela é editar um arquivo e
recarregar a página; não há classe inteira de problemas de configuração de build.

*Custos aceitos:* nada de JSX, reatividade automática ou gerenciamento de estado pronto — cada tela
atualiza o DOM explicitamente; mais código repetido do que um framework exigiria; sem checagem de
tipos, mitigado com JSDoc nas assinaturas públicas e, desde o [ADR 4.6](#46-adr-0006--verificação-de-tipos-sem-etapa-de-build-escopada-ao-código-puro),
com verificação estática desse JSDoc nas camadas sem DOM, ainda sem etapa de build; sem
*tree-shaking* nem minificação — irrelevante em rede local.

**Obrigação que isso cria:** como não há compilador para pegar erro, o que dá para testar sem
navegador tem que ser testável — daí a regra de que `domain/` não toca no DOM (ver
[ADR 4.5](#45-adr-0005--clientjs-dividido-por-responsabilidade)).

**Alternativas consideradas.** React + Vite — descartado: acrescenta uma cadeia de dependências e
um passo de build que a equipe não tem como manter, para resolver um problema de complexidade de
UI que este painel não tem. Web Components nativos — descartado por pouca margem: dariam
encapsulamento melhor, mas o Shadow DOM complicaria o tema global por variáveis CSS, que é o
mecanismo central da aparência do app.

### 4.2 ADR-0002 — SQLite embarcado, com driver síncrono

**Situação:** Aceita

**Contexto.** O painel substituiu um aplicativo Python/Tkinter que já guardava tudo num
`gestao.db` SQLite; os dados precisavam continuar funcionando sem migração. O uso é de uma equipe
pequena: dezenas de milhares de linhas, poucos usuários simultâneos, escrita esporádica — sem
requisito de alta concorrência de escrita nem de replicação.

**Decisão.** Continuar com SQLite, acessado por `better-sqlite3` — um driver **síncrono**. O
schema é criado e evoluído em código, por `src/database/Database.js`, na subida do servidor. Não
há ferramenta de migração externa.

**Consequências.**

*Ganhos:* o banco do app antigo continuou valendo (zero migração de dados); `better-sqlite3`
distribui binário pré-compilado, então `npm install` no Windows não precisa de compilador C++ (ao
contrário do driver `sqlite3`); sendo síncrono, o código de repositório é linear, sem `async`/
`await` nem callback para ler uma linha — elimina uma classe inteira de bugs de ordem de execução,
e é o que torna o `SqliteSessionStore` seguro (ver [ADR 4.3](#43-adr-0003--armazenamento-de-sessão-escrito-à-mão));
backup é copiar um arquivo — é literalmente o que `BackupService` faz.

*Custos aceitos:* uma consulta lenta trava o event loop do Node inteiro (com este volume, cada
consulta custa menos de um milissegundo; se o volume crescer muito, esta é a primeira premissa a
revisar); um servidor só, não dá para escalar horizontalmente sem trocar o banco; escrita é
serializada pelo SQLite, irrelevante para este padrão de uso. **Mitigação em uso:**
`journal_mode = WAL`, que permite leituras concorrentes durante uma escrita.

**Alternativas consideradas.** PostgreSQL — descartado: exigiria migrar os dados existentes,
instalar e manter um serviço a mais no servidor da empresa, e resolver um problema de concorrência
que não existe aqui. Driver `sqlite3` (assíncrono) — descartado: depende de compilação via
node-gyp no Windows, e sua cadeia de dependências de build tinha vulnerabilidades conhecidas à
época; o ganho (não bloquear o event loop) não se paga neste volume.

### 4.3 ADR-0003 — Armazenamento de sessão escrito à mão

**Situação:** Aceita

**Contexto.** `express-session` guarda sessões em memória por padrão, o que significa que todo
mundo é deslogado a cada reinício do servidor — inaceitável para um app que roda como serviço do
Windows e reinicia em toda atualização. A escolha natural seria `connect-sqlite3`, que faz
exatamente isso.

**Decisão.** Escrever `src/database/SqliteSessionStore.js`: uma classe que estende `session.Store`
e implementa `get`, `set`, `destroy`, `touch` e `clearAll` sobre um `sessions.sqlite` próprio,
usando o `better-sqlite3` que o app já usa.

**Consequências.**

*Ganhos:* nenhuma dependência nova — `connect-sqlite3` traria de volta o driver `sqlite3` (e sua
cadeia de build via node-gyp), justamente o que o [ADR 4.2](#42-adr-0002--sqlite-embarcado-com-driver-síncrono)
evitou; sendo síncrono, `set()` termina de gravar antes de responder, eliminando a corrida clássica
de "logar e a requisição seguinte chegar antes da sessão ser persistida"; `clearAll()` —
invalidar todas as sessões após restaurar um backup do banco — é uma necessidade específica deste
app que um pacote genérico não teria; arquivo separado do `gestao.db`, então restaurar um backup de
dados não restaura sessões antigas junto.

*Custos aceitos:* é código nosso para manter, mitigado por ser pequeno (~110 linhas) e pela
interface de `session.Store` ser mínima e estável; limpeza de sessões expiradas roda na subida do
servidor, não por um timer — num servidor que fica meses no ar, o arquivo cresce com sessões
vencidas até o próximo reinício (aceito: são linhas de texto curtas).

**Alternativas consideradas.** `connect-sqlite3` — descartado pela cadeia de dependências. Redis
(`connect-redis`) — descartado: exigiria instalar e manter um Redis para guardar algumas dezenas de
sessões. Sessão em JWT, sem estado no servidor — descartado: deixaria de existir a capacidade de
invalidar sessão do lado do servidor, que é justamente o que `clearAll()` precisa fazer depois de
restaurar um backup.

### 4.4 ADR-0004 — Injeção de dependência na mão, sem container

**Situação:** Aceita

**Contexto.** O servidor tem ~13 serviços e ~13 controllers, com dependências reais entre eles:
quase todo serviço recebe o banco e o `HistoricoService`; o `AlertaAgenteService` recebe
`VersaoService` e `NotificationService`; o `SaudeService` recebe banco, backups e versões. Esse é o
ponto em que projetos Node costumam adotar um container de DI (`awilix`, `tsyringe`,
`InversifyJS`) ou partir para singletons importados diretamente.

**Decisão.** A classe `Server` monta tudo à mão, em ordem explícita, em dois métodos:
`_buildServices()` e `_buildControllers()`. Cada dependência é passada pelo construtor. Nenhum
serviço importa outro diretamente. Nenhum módulo exporta instância pronta — só classes.

**Consequências.**

*Ganhos:* existe um arquivo que mostra o sistema inteiro — ler `Server.js` de cima a baixo revela
todos os componentes e quem depende de quem, o que nenhum container oferece; testar é instanciar
com o que se quiser no lugar (os testes sobem um `Server` completo com banco temporário justamente
porque montar é barato); ciclo de dependência vira erro na hora de escrever, não em tempo de
execução; zero mágica — nenhuma resolução por nome, nenhum decorator, nenhum `reflect-metadata`.

*Custos aceitos:* acrescentar um serviço exige editar `Server.js` (é uma linha, e o incômodo é
proporcional ao custo real de acrescentar um serviço, o que é saudável); a ordem de construção
dentro de `_buildServices()` importa (está explícito no código); uma instância de `BackupService`
acaba criada duas vezes — inofensivo, mas é o tipo de duplicação que um container evitaria de graça.

**Alternativas consideradas.** Container de DI (`awilix` etc.) — descartado: resolve acoplamento em
sistemas com dezenas de módulos e múltiplos escopos de vida; aqui, com um único escopo (o processo)
e ~26 objetos, o custo de entendimento supera o ganho. Singletons via `module.exports = new
Service()` — descartado: é o padrão que mais atrapalha teste em Node — uma vez que um módulo abre
o banco no `require`, não há mais como testá-lo com outro banco sem truque de cache de módulo.

### 4.5 ADR-0005 — `client/js/` dividido por responsabilidade

**Situação:** Aceita

**Contexto.** O front-end cresceu com duas pastas: `js/views/` (uma tela por arquivo) e `js/core/`
("o resto"). `core/` chegou a 35 arquivos misturando cinco coisas diferentes: utilidades genéricas,
vocabulário do negócio, componentes de UI, gráficos em SVG, o esqueleto do app, e uma tela inteira
de 1222 linhas (`ConfiguracoesPanel.js`) que, por tamanho e função, era uma `view`. A pasta
funcionava, mas não respondia à pergunta que mais importa no dia a dia: "onde eu ponho este arquivo
novo?" — a resposta era sempre "em `core/`", que é o mesmo que não ter resposta.

**Decisão.** Substituir `core/` por quatro pastas com um critério verificável cada, e mover
`ConfiguracoesPanel.js` para `views/`, onde estão os outros painéis:

| Pasta | Critério | Pode importar |
|---|---|---|
| `utils/` | não conhece o negócio | nada do projeto |
| `domain/` | conhece o negócio, **não toca no DOM** | `utils/` |
| `components/` | UI que não sabe em que tela está | `utils/`, `domain/` |
| `views/` | uma tela | tudo |
| `app/` | o esqueleto que segura o resto | tudo |

`components/charts/` agrupa os três gráficos SVG, que são componentes de uma família só.

**Consequências.**

*Ganhos:* a pergunta "onde ponho isso?" tem resposta mecânica (precisa do DOM? fala de
cliente/atualização/agente? é reaproveitável entre telas?); `domain/` não tocar no DOM é o que
permite testá-lo no Node sem navegador — e é exatamente onde mora a lógica que erra em silêncio
(classificação de retorno de agente, montagem de relatório), a contrapartida direta de não ter
compilador ([ADR 4.1](#41-adr-0001--front-end-sem-framework-e-sem-etapa-de-build)); a direção das
importações vira uma regra legível (`utils → domain → components → views`), e uma violação salta
aos olhos na revisão.

*Custos aceitos:* a migração reescreveu 175 caminhos de importação em 32 arquivos, feita por
script, com o grafo de módulos inteiro (55 módulos) linkado depois para garantir que todo import
resolvesse e todo nome importado existisse de fato; caminhos ficaram um pouco mais longos; links
para arquivos antigos, em anotações fora do repositório, quebraram.

**Efeito colateral valioso:** a migração revelou um bug real — um caminho de asset inexistente
respondia 200 com o `index.html`, porque o fallback de SPA capturava qualquer caminho fora de
`/api`; o navegador só reclamava depois, com uma mensagem de MIME type que manda procurar no lugar
errado. Corrigido em `Server.js` e `middlewares/notFoundHandler.js`, com teste de regressão em
`tests/routing.test.js`.

**Alternativas consideradas.** Manter `core/` e só criar subpastas dentro dela — descartado:
manteria o nome que não significa nada, só empurrando o problema um nível abaixo. Organizar por
funcionalidade (`clientes/`, `atualizacoes/`, cada uma com sua view, seus componentes e seus
helpers) — descartado: é a divisão certa quando os módulos são independentes, mas aqui quase todo
componente é usado por quase toda tela; levaria a uma pasta `compartilhado/` que seria a `core/` de
volta, com outro nome.

### 4.6 ADR-0006 — Verificação de tipos sem etapa de build, escopada ao código puro

**Situação:** Aceita

**Contexto.** O [ADR 4.1](#41-adr-0001--front-end-sem-framework-e-sem-etapa-de-build) aceitou
explicitamente um custo: "sem checagem de tipos, mitigado com JSDoc nas assinaturas públicas". Na
prática, a mitigação valia menos do que parecia — o JSDoc existia, mas ninguém o verificava, então
envelhecia sem que nada reclamasse. Uma auditoria encontrou quatro anotações desatualizadas em
produção, todas do mesmo tipo: o código estava certo, a documentação é que ficara para trás. A
pior delas: `View.js` declarava uma assinatura que dizia não dar para passar filtros ao trocar de
aba — exatamente o que `ResumoView` e `AgendamentosView` fazem, e precisam fazer. O caminho óbvio
(migrar para TypeScript) reintroduziria o passo de build que o ADR 4.1 rejeitou por razões que
continuam válidas.

**Decisão.** Usar o TypeScript apenas como conferente, com `checkJs` e `noEmit`, sobre o
JavaScript que já existe e o JSDoc que ele já tem. Nada é compilado, nada é gerado. A verificação é
escopada ao código puro dos dois lados:

| Config | Cobre | Critério |
|---|---|---|
| `client/tsconfig.json` | `js/domain/`, `js/utils/` | não tocam no DOM ([ADR 4.5](#45-adr-0005--clientjs-dividido-por-responsabilidade)) |
| `server/tsconfig.json` | `src/shared/`, `services/normalizacao.js` | não falam com o Node nem com o banco |

Nos dois casos a `lib` do TypeScript é só `es2022` — sem `dom`, sem `node`; é essa ausência que
torna o critério automático: um arquivo novo que precise do `document` ou do `fs` está na pasta
errada, e o erro é o aviso. Execução por `npm run check`, também no CI. Modo estrito ligado, exceto
`noImplicitAny`.

**Consequências.**

*Ganhos:* JSDoc passa a ter consequência — uma anotação que mente vira erro no CI, em vez de virar
armadilha para quem lê; nessas pastas o resultado é binário (zero erros, ou achou algo real);
editores que leem `tsconfig.json` marcam o erro enquanto se digita; custo zero em tempo de execução
e nenhuma dependência nova no navegador.

*Custos aceitos:* a maior parte do front-end fica de fora — `views/`, `components/` e `app/` não
são verificados (ali o mesmo comando produz ~350 erros de manipulação de DOM sem tipos, ruído que
ninguém leria); `noImplicitAny` desligado deixa passar parâmetro sem anotação (~80 casos); mais uma
ferramenta para manter atualizada.

**O que isso já encontrou na primeira execução:** um bug de verdade em produção — `SaudeService`
lia uma propriedade que `VersaoService` nunca teve, e como `fs.existsSync(undefined)` devolve
`false` em vez de lançar, o painel de Saúde reportava "0 pacotes, 0 bytes" para sempre, sem erro no
log (o teste que existia não pegava, porque o dublê de `versoes` declarava a propriedade que o
objeto real não implementava); quatro anotações JSDoc desatualizadas (`View.js`, `Toast.js`,
`SortableTable.js`, `ConfiguracoesPanel.js`); uma subtração de datas que só funcionava por coerção
implícita, e duas comparações que dependiam do mesmo tipo de regra tácita.

**Alternativas consideradas.** Migrar para TypeScript de verdade — descartado: reintroduz o passo
de build que o ADR 4.1 comprou ao abrir mão de tipos. Rodar `checkJs` no projeto inteiro e conviver
com os erros — descartado: 350 avisos falsos treinam a equipe a ignorar a saída da ferramenta.
Adicionar *casts* JSDoc em massa para calar o ruído de DOM — descartado: centenas de anotações
escritas para agradar a ferramenta, não para comunicar algo a quem lê. ESLint em vez de verificação
de tipos — descartado para este problema: pega estilo e erros sintáticos, não pegaria nenhum dos
achados acima (todos de tipo); continua sendo uma adição possível, ortogonal a esta.

### 4.7 ADR-0007 — Piloto, rollback e concorrência otimista

**Situação:** Aceita em setembro de 2026.

**Contexto.** Uma publicação geral alcança automaticamente todos os agentes de um sistema. Ao mesmo
tempo, duas pessoas podem abrir o mesmo agendamento e salvar versões diferentes sem perceber a
edição concorrente.

**Decisão.**

- Versões restritas usam `alcance = piloto` e uma lista de códigos de clientes vindos do cadastro.
  O endpoint do agente escolhe primeiro um piloto destinado àquele código (mantendo `cnpj` apenas
  como nome legado no contrato do Worker) e, para os demais, mantém a publicação geral.
- Promover um piloto reutiliza a mesma transação atômica de publicação geral.
- Rollback restaura a versão que foi diretamente substituída pela versão ativa e tira a versão
  problemática de circulação na mesma transação SQLite.
- Registros editáveis recebem um número de revisão. O cliente envia a revisão que abriu e o
  servidor responde `409 Conflict` quando outra gravação já a incrementou.

**Consequências.** O agente continua usando o contrato existente de `update/check`; a seleção do
alcance fica inteiramente no servidor. O histórico de versões permanece auditável, pois promoção e
rollback mudam estados em vez de apagar linhas. Interfaces de edição precisam conservar e reenviar
a revisão recebida.

---

## 5. Como verificar

**Painel web:**

```bash
cd web/server && npm start
```

O console mostra a migração na primeira vez.

| O quê | Como |
|---|---|
| Rota na URL | Trocar de aba → URL vira `#/clientes`; recarregar mantém a tela |
| Paleta | `Ctrl+K`, digitar o nome de um cliente, `Enter` → abre a ficha |
| Tema | Botão no cabeçalho cicla sistema → escuro → claro; recarregar mantém |
| Cache | Ir e voltar entre abas → aparece na hora, com a barra fina revalidando |
| Resumo | Clicar em "Parados há mais de 60 dias" → rola até a lista |
| Distribuição | Escolher sistema → aviso diz qual versão sai do ar |
| Substituição | Publicar → toast diz qual saiu; a antiga vira "Substituída" |
| Trava de exclusão | Tentar excluir a versão "No ar" → recusa explicada |
| Upload | Enviar pacote grande → barra de progresso |
| Desfazer | Excluir uma atualização → toast com "Desfazer" |
| Escape | Preencher o formulário, `Esc` → toast com "Restaurar" |
| Exportar | Filtrar e exportar → `atualizacoes-filtrado.xlsx` só com o filtrado |
| Teclado | `Tab` até a tabela, `↑`/`↓` navega, `Enter` seleciona |
| Atalhos | `?` abre a lista |

**Verificação automática** (substitui a conferência de sintaxe arquivo a arquivo que ficava
aqui — aquele laço só provava que o arquivo *parseava*, não que os imports resolviam nem que os
tipos batiam):

```bash
cd web
npm install       # uma vez; traz só o verificador de tipos
npm run check     # tipos, sem etapa de build (ver adr/0006)
npm test          # 458 testes: 359 no servidor, 99 no front-end
```

Entre os testes do front-end há um que **linka o grafo de módulos inteiro** a partir do
`index.html`: ele pega import quebrado, nome importado que não existe e módulo órfão — que era
justamente o que a conferência de sintaxe não alcançava.

**Agente C#:**

```bash
cd atualizador
dotnet build AtualizadorERP.sln -warnaserror
dotnet test  AtualizadorERP.sln                          # 39 testes (exige Firebird 2.5)
dotnet test  AtualizadorERP.sln --filter "Requer!=Firebird"   # 6 testes -- é o que o CI roda
```

Os 39 testes de integração rodam contra Firebird real (não mockado) — cobrem `ProcessService`,
`DatabaseService`, `ScriptRunnerService` e o ciclo completo do `Worker`, incluindo o formato de
`EXECUTAVEIS` e a retenção de backups. Para validar o ciclo ponta a ponta contra um cliente de
teste, ver o passo a passo em `atualizador/README.md` (Fase 2 precisa ser simulada gravando
`AUTORIZADO` direto no banco via `isql`, já que ainda não existe no ERP Delphi).

---

## 6. Auditoria de agosto/set 2026 — o que mudou desde então

Em 27/08/2026, uma auditoria técnica comparou três documentos de arquitetura anteriores —
`Planejamento_Tecnico_Atualizador_ERP_v4` (especificação técnica completa, propondo MD5 e um
ciclo de 4 estados sem `PROCESSANDO`), uma apresentação executiva com a mesma arquitetura em
linguagem de negócio, e um "Documento Técnico v1.0" já revisado (SHA-256, 5 estados incluindo
`PROCESSANDO`) — contra o código-fonte real e, numa segunda passada, contra os próprios binários e
dados de produção (`BScript.exe`, `BEXE.FDB` de 44 MB, `BScript.Ini`, 1026 scripts DDL reais).

O resultado da auditoria: 14 comportamentos de segurança/orquestração confirmados batendo com o
documento técnico v1.0, e 12 achados novos (2 críticos, 4 de alta severidade, 3 de média, 3 de
baixa) que nenhum dos três documentos de arquitetura tinha como revelar — viviam em decisões de
implementação só visíveis lendo o C#/Node.js linha a linha, ou abrindo os próprios binários e a
base de produção.

**Todos os achados dessa auditoria foram corrigidos** nas semanas seguintes — a tabela completa,
com data de cada correção, está na [seção 3.9](#39-histórico-de-correções-críticas). Os dois
achados críticos da auditoria, em particular, motivaram as duas maiores mudanças de desenho do
projeto:

| Achado crítico da auditoria (27/08) | O que virou |
|---|---|
| `BScript.exe` real parece ser um programa gráfico interativo, sem nenhum modo silencioso — automatizá-lo podia travar o servidor do cliente inteiro | Confirmado por teste real em 31/08 (`/silent` ignorado duas vezes) → `BScript.exe` **substituído por `ScriptRunnerService`**, que aplica os `.sql` diretamente via `isql` |
| Uma atualização que falha some do radar: `VERSAO_NOVA` era gravado antes da autorização e nunca revertido em falha, então o próximo polling via "nada de novo" | Corrigido em 31/08 com a coluna `VERSAO_ATUAL`, separada do alvo em disputa |

Os achados de alta/média severidade também foram todos endereçados: o schema real do `BEXE.fdb`
(tabela `EXECUTAVEIS`, não `VERSOES_EXE`) foi confirmado e, depois, corrigido campo a campo (achado
novo em 03/09, quando uma comparação mais profunda revelou que 4 dos 6 campos ainda estavam no
formato errado); a porta do Firebird virou configurável; as credenciais deixaram de ir na linha de
comando; a injeção do BEXE ganhou verificação de lista vazia; o backoff foi corrigido para valer
mesmo depois de uma falha real de atualização, não só de download.

Um relatório de revisão técnica complementar, também de 27/08, comparou os mesmos três documentos
contra um desenho anterior descartado (pipeline de 25 etapas com rename de banco via n8n) e
recomendou tratar o projeto atual como a direção definitiva — recomendação que se confirmou: a
técnica de isolamento via `gfix -shut` (em vez de parar o serviço Firebird inteiro ou fazer
rename/cópia do banco) segue sendo a base do ciclo até hoje.

**O que ficou sem solução de código, porque depende de decisão/trabalho fora deste repositório:**
a Fase 2 em Delphi (nenhum `.pas`/`.dpr` existe), o schema real de `JUNIOR.fdb` além de
`SYS_ATUALIZACAO` (o agente cria essa tabela sozinha, mas o resto do banco nunca foi auditado por
falta de cópia disponível), e a idempotência definitiva dos ~2300 scripts históricos — todos
listados como pendências ativas na [seção 3.4](#34-estado-atual-pré-piloto).

---

## 7. Histórico deste documento — o que foi consolidado

Este documento substitui os seguintes arquivos, que existiam separadamente em `web/docs/` e foram
removidos após terem seu conteúdo relevante incorporado acima (o histórico completo de cada um
continua disponível no `git log`, se for preciso consultar o texto original):

| Arquivo removido | Natureza | Para onde foi |
|---|---|---|
| `ARCHITECTURE.md` | Arquitetura do código do painel web | [Seção 2.2](#22-arquitetura-do-código) |
| `RELATORIO_IMPLEMENTACAO.md` | Relatório de implementação do agente C#, 26–27/08 | Superado pelo estado real de 03/09 — [seção 3](#3-atualizador-inteligente-de-erp--agente-local-c) e [seção 6](#6-auditoria-de-agostoset2026-o-que-mudou-desde-então) |
| `REVISAO_INTERFACE.md` | Revisão de interface/distribuição do painel, set/2026 | [Seção 2.3](#23-revisão-de-interface-e-distribuição--set2026) |
| `Planejamento_Tecnico_Atualizador_ERP_v4.pdf` | Especificação técnica original (MD5, sem estado `PROCESSANDO`) | Contexto histórico na [seção 6](#6-auditoria-de-agostoset2026-o-que-mudou-desde-então) |
| `Projeto_Arquitetura_Atualizador_ERP.pdf` | Apresentação executiva da mesma arquitetura | Contexto histórico na [seção 6](#6-auditoria-de-agostoset2026-o-que-mudou-desde-então) |
| `Documento_Tecnico_Atualizador_ERP.html`/`.pdf` | Documento técnico v1.0 (26/08) | Substituído pela [seção 3](#3-atualizador-inteligente-de-erp--agente-local-c), que reflete o estado atual |
| `documento-oficial-atualizador-erp.pdf`/`.docx` | Auditoria técnica completa (27/08) | Resumida na [seção 6](#6-auditoria-de-agostoset2026-o-que-mudou-desde-então); achados individuais na [tabela da seção 3.9](#39-histórico-de-correções-críticas) |
| `auditoria_atualizador_erp.html` | Mesma auditoria, versão HTML estilizada | Idem acima |
| `relatorio-atualizador-erp.docx` | Revisão técnica complementar (27/08), comparando contra um desenho anterior descartado | Resumida no último parágrafo da [seção 6](#6-auditoria-de-agostoset2026-o-que-mudou-desde-então) |
| `apresentacao-atualizador-erp.docx` | Proposta de projeto em linguagem executiva | Conteúdo condensado na [seção 1](#1-visão-geral-do-projeto) |
| `Apresentacao_Atualizador_Inteligente_ERP.pptx` | Slides gerados a partir do documento técnico e das capturas de tela | Conteúdo coberto pelas seções 1–3; os slides em si não têm informação que não esteja aqui |
| `tela-distribuicao.png`, `tela-resumo.png` | Capturas de tela usadas nos slides acima | Removidas junto com a apresentação — ilustravam a mesma interface descrita na seção 2 |
| `gerar-apresentacao.js`, `gerar-pdf-texto.js` | Scripts geradores dos artefatos acima | Sem função depois que os artefatos que geravam deixaram de existir |

**Por que consolidar:** os documentos acima descreviam o mesmo projeto em estágios sucessivos —
uma proposta inicial, três especificações técnicas concorrentes, uma auditoria comparando-as com o
código, e um relatório de correções — cada um congelado na data em que foi escrito. Entre o
relatório de implementação (27/08) e a revisão mais recente do agente (03/09), o código avançou o
suficiente para tornar boa parte do conteúdo desatualizado (o `BScript.exe` que o relatório
descrevia como corrigido com timeout foi, na verdade, **substituído por completo** dias depois).
Manter nove documentos derivados uns dos outros, sem um único dono, é como a divergência entre
"Documento Técnico v1.0" e o código real aconteceu em primeiro lugar. Este arquivo foi, a partir de
09/09/2026, a única fonte para este assunto em `web/docs/`.

### 7.1 Segunda rodada de consolidação — 22/09/2026

`web/docs/` tinha voltado a acumular arquivos: dois relatórios de melhorias que discordavam entre
si sobre o que já tinha sido entregue, uma apresentação executiva separada, sete ADRs soltos e um
índice próprio para eles, além de `CLAUDE.md`/`CONTRIBUTING.md`/`SECURITY.md`/`CHANGELOG.md`
movidos para dentro da pasta junto com o resto. A pasta foi reorganizada em dois passos:

**Passo 1 (mais cedo, mesmo dia).** `ANALISE_MELHORIAS_WEB.md` (auditoria técnica, 18/09) e
`PLANEJAMENTO_MELHORIAS_UX_UI.md` (planejamento de UX/UI, também 18/09) foram fundidos em
[`MELHORIAS.md`](MELHORIAS.md). Achado na reconciliação: quase todo o roadmap do segundo já tinha
sido entregue — confirmado no código e na entrada "Roadmap UX/UI entregue em quatro frentes" do
[`CHANGELOG.md`](CHANGELOG.md) — mas o documento continuava descrevendo esses itens como proposta
futura. `MELHORIAS.md` ficou com o que sobrou de genuinamente pendente.

**Passo 2 (este).** `APRESENTACAO_EXECUTIVA_ATUALIZACAO_ERP.md` virou a [seção 0](#0-resumo-executivo)
deste documento, e os sete ADRs (mais `adr/README.md`) viraram a [seção 4](#4-decisões-de-arquitetura--adrs-do-painel-web).
`CLAUDE.md`, `CONTRIBUTING.md` e `SECURITY.md` voltaram para a raiz de `web/` — são arquivos com
significado especial para ferramentas (GitHub reconhece `CONTRIBUTING`/`SECURITY` por nome e local;
o Claude Code carrega `CLAUDE.md` automaticamente), então fundi-los aqui dentro quebraria essas
integrações. `CHANGELOG.md` também voltou para a raiz — é o `../CHANGELOG.md` referenciado em todo
este documento.

Resultado: `web/docs/` ficou com quatro arquivos de conteúdo — este (`DOCUMENTACAO_CONSOLIDADA.md`),
[`OPERACAO.md`](OPERACAO.md), [`MELHORIAS.md`](MELHORIAS.md) e o [`README.md`](README.md) índice —
mais o `atualizador/docs/adr/` do outro repositório, que não foi tocado por esta reorganização.
